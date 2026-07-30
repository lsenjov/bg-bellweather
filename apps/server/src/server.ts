import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import {
  CommandAcceptedSchema,
  CommandEnvelopeSchema,
  CreateLobbyRequestSchema,
  CreateLobbyResponseSchema,
  JoinLobbyRequestSchema,
  JoinLobbyResponseSchema,
  ReplayResponseSchema
} from "@bellwether/protocol";
import { WebSocketServer } from "ws";
import { ZodError } from "zod";
import { createSeatToken } from "./auth.js";
import { AppError } from "./errors.js";
import { projectEvent, projectState } from "./projection.js";
import { EventStore } from "./store.js";
import { Subscriptions } from "./subscriptions.js";

export interface AppServerOptions {
  databasePath: string;
  host?: string;
  port?: number;
  now?: () => Date;
}

export function createAppServer(options: AppServerOptions) {
  if (options.databasePath !== ":memory:") {
    mkdirSync(dirname(options.databasePath), { recursive: true });
  }
  const store = new EventStore(options.databasePath);
  const subscriptions = new Subscriptions(store);
  const now = options.now ?? (() => new Date());
  const server = createHttpServer(async (request, response) => {
    try {
      await route(request, response, store, subscriptions, now);
    } catch (error) {
      writeError(response, error);
    }
  });
  const webSockets = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url?.match(/^\/api\/v1\/games\/[^/]+\/events(?:\?.*)?$/)) {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      subscriptions.attach(webSocket);
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
      return {
        host,
        port:
          typeof address === "object" && address !== null
            ? address.port
            : port
      };
    },
    async close(): Promise<void> {
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
  now: () => Date
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    writeJson(response, 200, { status: "ok", rulesetVersion: "1" });
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
      rulesetVersion: "1",
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
      timestamp
    );
    const accepted = CommandAcceptedSchema.parse(processed.accepted);
    if (processed.event !== null) {
      subscriptions.broadcast(processed.event);
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

  throw new AppError(404, "not_found", "Route not found");
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
  const protocolCode =
    appError.code === "version_conflict"
      ? "version_conflict"
      : appError.code === "idempotency_conflict"
        ? "idempotency_conflict"
      : appError.code === "phase_closed"
        ? "phase_closed"
        : appError.status === 400
          ? "invalid_request"
          : appError.status === 401
            ? "unauthorized"
            : appError.status === 403
              ? "forbidden"
              : appError.status === 404
                ? "not_found"
                : appError.status >= 500
                  ? "internal_error"
                  : "illegal_action";
  writeJson(response, appError.status, {
    error: {
      code: protocolCode,
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
