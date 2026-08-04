import { createHash, randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CommandAcceptedSchema,
  CommandEnvelopeSchema,
  CreateLobbyRequestSchema,
  CreateLobbyResponseSchema,
  JoinLobbyRequestSchema,
  JoinLobbyResponseSchema,
  ReplayResponseSchema
} from "@bellweather/protocol";
import { engineVersion } from "@bellweather/game";
import { WebSocketServer } from "ws";
import { ZodError } from "zod";
import { createSeatToken } from "./auth.js";
import { AppError, protocolErrorCode } from "./errors.js";
import { projectEvent, projectState } from "./projection.js";
import { EventStore } from "./store.js";
import { Subscriptions } from "./subscriptions.js";

export interface AppServerOptions {
  databasePath: string;
  host?: string;
  port?: number;
  now?: () => Date;
  randomInteger?: (maxExclusive: number) => number;
  webRoot?: string;
}

export function createAppServer(options: AppServerOptions) {
  if (options.databasePath !== ":memory:") {
    mkdirSync(dirname(options.databasePath), { recursive: true });
  }
  const store = new EventStore(options.databasePath);
  const subscriptions = new Subscriptions(store);
  const now = options.now ?? (() => new Date());
  const random = {
    integer: options.randomInteger ?? ((maxExclusive: number) => randomInt(maxExclusive))
  };
  const webRoot =
    options.webRoot ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  const deadlines = new CounterbidDeadlines(store, subscriptions, now, random);
  const server = createHttpServer(async (request, response) => {
    try {
      await route(
        request,
        response,
        store,
        subscriptions,
        deadlines,
        now,
        random,
        webRoot
      );
    } catch (error) {
      writeError(response, error);
    }
  });
  const webSockets = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const eventRoute = request.url?.match(
      /^\/api\/v1\/games\/([^/]+)\/events(?:\?.*)?$/
    );
    if (eventRoute?.[1] === undefined) {
      socket.destroy();
      return;
    }
    let gameReference: string;
    try {
      gameReference = decodeURIComponent(eventRoute[1]);
    } catch {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      subscriptions.attach(webSocket, gameReference);
    });
  });

  return {
    store,
    server,
    async listen(): Promise<{ host: string; port: number }> {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ?? 4317;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      deadlines.recover();
      return {
        host,
        port:
          typeof address === "object" && address !== null
            ? address.port
            : port
      };
    },
    async close(): Promise<void> {
      deadlines.close();
      for (const client of webSockets.clients) {
        client.close(1001, "Server shutting down");
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      webSockets.close();
      store.close();
    }
  };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  store: EventStore,
  subscriptions: Subscriptions,
  deadlines: CounterbidDeadlines,
  now: () => Date,
  random: { integer(maxExclusive: number): number },
  webRoot: string
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    writeJson(response, 200, { status: "ok", rulesetVersion: engineVersion });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/games") {
    const input = CreateLobbyRequestSchema.parse(await readJson(request));
    const gameId = randomUUID();
    const seatId = randomUUID();
    const inviteCode = createInviteCode();
    const { token, digest } = createSeatToken();
    const timestamp = now().toISOString();
    const mutation = store.createLobby({
      id: gameId,
      code: inviteCode,
      rulesetVersion: engineVersion,
      settings: {
        seatCount: input.configuration.playerCount,
        counterbidTimerSeconds:
          input.configuration.counterbidTimer.mode === "off"
            ? null
            : input.configuration.counterbidTimer.durationSeconds,
        allowSpectators: input.configuration.allowSpectators
      },
      seat: {
        id: seatId,
        displayName: input.displayName,
        controller: input.controller,
        token: digest
      },
      now: timestamp
    });
    subscriptions.broadcast(mutation.event);
    writeJson(
      response,
      201,
      CreateLobbyResponseSchema.parse({
        inviteCode,
        session: {
          participantType: "seat",
          gameId,
          seatId,
          accessToken: token
        },
        state: projectState(store, mutation.game, seatId)
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/games/join") {
    const input = JoinLobbyRequestSchema.parse(await readJson(request));
    if (input.role === "spectator") {
      const game = store.resolveGame(input.inviteCode);
      const spectatorId = randomUUID();
      const { token, digest } = createSeatToken();
      const mutation = store.joinSpectator({
        gameReference: game.id,
        spectator: {
          id: spectatorId,
          displayName: input.displayName,
          controller: input.controller,
          token: digest
        },
        now: now().toISOString()
      });
      subscriptions.broadcast(mutation.event);
      writeJson(
        response,
        201,
        JoinLobbyResponseSchema.parse({
          session: {
            participantType: "spectator",
            gameId: game.id,
            spectatorId,
            accessToken: token
          },
          state: projectState(store, mutation.game)
        })
      );
      return;
    }
    const game = store.resolveGame(input.inviteCode);
    const seatId = randomUUID();
    const { token, digest } = createSeatToken();
    const mutation = store.joinLobby({
      gameReference: game.id,
      seat: {
        id: seatId,
        displayName: input.displayName,
        controller: input.controller,
        token: digest
      },
      now: now().toISOString()
    });
    subscriptions.broadcast(mutation.event);
    writeJson(
      response,
      201,
      JoinLobbyResponseSchema.parse({
        session: {
          participantType: "seat",
          gameId: game.id,
          seatId,
          accessToken: token
        },
        state: projectState(store, mutation.game, seatId)
      })
    );
    return;
  }

  const stateMatch = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/state$/);
  if (request.method === "GET" && stateMatch?.[1] !== undefined) {
    const authenticated = store.authenticateParticipant(
      decodeURIComponent(stateMatch[1]),
      bearerToken(request)
    );
    writeJson(
      response,
      200,
      projectState(
        store,
        authenticated.game,
        "seat" in authenticated ? authenticated.seat.id : undefined
      )
    );
    return;
  }

  const commandMatch = url.pathname.match(
    /^\/api\/v1\/games\/([^/]+)\/commands$/
  );
  if (request.method === "POST" && commandMatch?.[1] !== undefined) {
    const authenticated = store.authenticate(
      decodeURIComponent(commandMatch[1]),
      bearerToken(request)
    );
    const command = CommandEnvelopeSchema.parse(await readJson(request));
    if (command.gameId !== authenticated.game.id) {
      throw new AppError(400, "invalid_request", "Command gameId does not match route");
    }
    const timestamp = now().toISOString();
    const processed = store.processCommand(
      authenticated.game.id,
      authenticated.seat.id,
      {
        idempotencyKey: command.idempotencyKey,
        requestHash: hashCommand(command),
        expectedVersion: command.expectedVersion,
        type: command.command.type,
        payload: command.command
      },
      timestamp,
      random
    );
    const accepted = CommandAcceptedSchema.parse(processed.accepted);
    if (processed.event !== null) {
      subscriptions.broadcast(processed.event);
      deadlines.schedule(authenticated.game.id);
    }
    writeJson(response, 200, accepted);
    return;
  }

  const replayMatch = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/replay$/);
  if (request.method === "GET" && replayMatch?.[1] !== undefined) {
    const authenticated = store.authenticateParticipant(
      decodeURIComponent(replayMatch[1]),
      bearerToken(request)
    );
    if (authenticated.game.status !== "finished") {
      throw new AppError(409, "phase_closed", "Full replay unlocks after the game");
    }
    store.requireEngineState(authenticated.game.id);
    const events = store.listEvents(authenticated.game.id).map((event) =>
      projectEvent(
        event,
        "seat" in authenticated ? authenticated.seat.id : undefined,
        true
      )
    );
    writeJson(
      response,
      200,
      ReplayResponseSchema.parse({
        gameId: authenticated.game.id,
        latestSequence: authenticated.game.currentVersion,
        events
      })
    );
    return;
  }

  if (
    request.method === "GET" &&
    !url.pathname.startsWith("/api/") &&
    serveWebApp(response, webRoot, url.pathname)
  ) {
    return;
  }
  throw new AppError(404, "not_found", "Route not found");
}

class CounterbidDeadlines {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(
    private readonly store: EventStore,
    private readonly subscriptions: Subscriptions,
    private readonly now: () => Date,
    private readonly random: { integer(maxExclusive: number): number }
  ) {}

  recover(): void {
    for (const gameId of this.store.listCurrentActiveGameIds()) {
      try {
        this.schedule(gameId);
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "unsupported_ruleset") {
          throw error;
        }
      }
    }
  }

  schedule(gameId: string): void {
    const existing = this.timers.get(gameId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.timers.delete(gameId);
    }
    if (this.stopped) {
      return;
    }
    const state = this.store.loadEngineState(gameId);
    if (
      state?.phase.type !== "counterbidding" ||
      state.phase.deadlineAt === null
    ) {
      return;
    }
    const delay = Math.max(0, state.phase.deadlineAt - this.now().getTime());
    const timer = setTimeout(
      () => this.expire(gameId),
      Math.min(delay, 2_147_483_647)
    );
    this.timers.set(gameId, timer);
  }

  close(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private expire(gameId: string): void {
    this.timers.delete(gameId);
    if (this.stopped) {
      return;
    }
    const event = this.store.expireCounterbids(
      gameId,
      this.now().toISOString(),
      this.random
    );
    if (event !== null) {
      this.subscriptions.broadcast(event);
    }
    this.schedule(gameId);
  }
}

function serveWebApp(
  response: ServerResponse,
  webRoot: string,
  pathname: string
): boolean {
  if (!existsSync(webRoot)) {
    return false;
  }
  const decoded = decodeURIComponent(pathname);
  const requested = resolve(webRoot, `.${decoded}`);
  if (requested !== webRoot && !requested.startsWith(`${webRoot}/`)) {
    throw new AppError(403, "forbidden", "Invalid web path");
  }
  const asset =
    existsSync(requested) && statSync(requested).isFile()
      ? requested
      : resolve(webRoot, "index.html");
  if (!existsSync(asset) || !statSync(asset).isFile()) {
    return false;
  }
  response.writeHead(200, {
    "content-type": contentType(asset),
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cache-control":
      asset.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable"
  });
  response.end(readFileSync(asset));
  return true;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".woff2":
      return "font/woff2";
    default:
      return "text/html; charset=utf-8";
  }
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new AppError(401, "unauthorized", "Bearer seat token required");
  }
  return authorization.slice(7);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) {
      throw new AppError(413, "invalid_request", "Request body is too large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new AppError(400, "invalid_request", "JSON request body required");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError(400, "invalid_request", "Request body must be valid JSON");
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof ZodError) {
    writeJson(response, 400, {
      error: {
        code: "invalid_request",
        message: "Request did not match the API contract",
        retryable: false,
        validationIssues: error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message
        }))
      }
    });
    return;
  }
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          error instanceof SyntaxError ? 400 : 500,
          error instanceof SyntaxError ? "invalid_request" : "internal_error",
          error instanceof SyntaxError
            ? error.message
            : "Internal server error"
        );
  writeJson(response, appError.status, {
    error: {
      code: protocolErrorCode(appError),
      message: appError.message,
      retryable: appError.status >= 500,
      ...(appError.details === undefined ? {} : { details: appError.details })
    }
  });
}

function createInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function hashCommand(command: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
}
