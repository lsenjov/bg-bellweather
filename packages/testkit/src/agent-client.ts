import {
  ClientWebSocketFrameSchema,
  CommandAcceptedSchema,
  CreateLobbyResponseSchema,
  JoinLobbyResponseSchema,
  ReplayResponseSchema,
  ServerWebSocketFrameSchema,
  ViewerStateEnvelopeSchema,
  type AccessToken,
  type ClientWebSocketFrame,
  type CommandAccepted,
  type CommandEnvelope,
  type CreateLobbyRequest,
  type CreateLobbyResponse,
  type GameId,
  type JoinLobbyRequest,
  type JoinLobbyResponse,
  type ReplayResponse,
  type ServerWebSocketFrame,
  type ViewerStateEnvelope,
} from "@bellwether/protocol";

export type FetchLike = typeof fetch;

export interface WebSocketMessageEvent {
  readonly data: unknown;
}

export interface WebSocketCloseEvent {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

export interface WebSocketLike {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: WebSocketMessageEvent) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: "close", listener: (event: WebSocketCloseEvent) => void): void;
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "message", listener: (event: WebSocketMessageEvent) => void): void;
  removeEventListener(type: "error", listener: () => void): void;
  removeEventListener(type: "close", listener: (event: WebSocketCloseEvent) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface AgentClientRoutes {
  readonly createGame: string;
  readonly joinGame: string;
  state(gameId: string): string;
  commands(gameId: string): string;
  events(gameId: string): string;
  replay(gameId: string): string;
}

export interface AgentClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: AccessToken;
  readonly fetch?: FetchLike;
  readonly webSocketFactory?: WebSocketFactory;
  readonly routes?: Partial<AgentClientRoutes>;
}

export interface EventStreamOptions {
  readonly afterSequence?: number;
  readonly signal?: AbortSignal;
}

interface PendingRead<T> {
  resolve(result: IteratorResult<T>): void;
  reject(error: unknown): void;
}

const defaultRoutes: AgentClientRoutes = {
  createGame: "/api/v1/games",
  joinGame: "/api/v1/games/join",
  state: (gameId) => `/api/v1/games/${encodeURIComponent(gameId)}/state`,
  commands: (gameId) => `/api/v1/games/${encodeURIComponent(gameId)}/commands`,
  events: (gameId) => `/api/v1/games/${encodeURIComponent(gameId)}/events`,
  replay: (gameId) => `/api/v1/games/${encodeURIComponent(gameId)}/replay`,
};

export class AgentClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "AgentClientError";
    this.status = status;
    this.body = body;
  }
}

export class AgentEventStream
  implements AsyncIterable<ServerWebSocketFrame>, AsyncIterator<ServerWebSocketFrame>
{
  readonly socket: WebSocketLike;

  private readonly buffered: ServerWebSocketFrame[] = [];
  private readonly waiting: PendingRead<ServerWebSocketFrame>[] = [];
  private readonly detachAbort?: () => void;
  private ended = false;
  private failure: unknown;

  constructor(socket: WebSocketLike, frame: ClientWebSocketFrame, signal?: AbortSignal) {
    this.socket = socket;

    const handleOpen = () => {
      if (!this.ended) {
        socket.send(JSON.stringify(frame));
      }
    };
    const handleMessage = (event: WebSocketMessageEvent) => {
      try {
        this.push(parseSocketFrame(event.data));
      } catch (error) {
        this.fail(error);
        socket.close(1007, "Invalid event frame");
      }
    };
    const handleError = () => {
      this.fail(new Error("WebSocket transport error"));
      socket.close(1011, "WebSocket transport error");
    };
    const handleClose = (event: WebSocketCloseEvent) => {
      if (!event.wasClean && this.failure === undefined) {
        this.fail(new Error(`WebSocket closed with code ${event.code}: ${event.reason}`));
      } else {
        this.finish();
      }
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
      this.detachAbort?.();
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);

    if (signal !== undefined) {
      const handleAbort = () => this.close(1000, "Aborted");
      signal.addEventListener("abort", handleAbort, { once: true });
      this.detachAbort = () => signal.removeEventListener("abort", handleAbort);
      if (signal.aborted) {
        handleAbort();
      }
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<ServerWebSocketFrame> {
    return this;
  }

  next(): Promise<IteratorResult<ServerWebSocketFrame>> {
    const frame = this.buffered.shift();
    if (frame !== undefined) {
      return Promise.resolve({ done: false, value: frame });
    }
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    if (this.ended) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<ServerWebSocketFrame>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  close(code = 1000, reason = "Client closed"): void {
    if (this.ended) {
      return;
    }
    this.finish();
    this.socket.close(code, reason);
  }

  private push(frame: ServerWebSocketFrame): void {
    if (this.ended) {
      return;
    }
    const pending = this.waiting.shift();
    if (pending === undefined) {
      this.buffered.push(frame);
    } else {
      pending.resolve({ done: false, value: frame });
    }
  }

  private finish(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    for (const pending of this.waiting.splice(0)) {
      pending.resolve({ done: true, value: undefined });
    }
  }

  private fail(error: unknown): void {
    if (this.ended) {
      return;
    }
    this.failure = error;
    this.ended = true;
    for (const pending of this.waiting.splice(0)) {
      pending.reject(error);
    }
  }
}

export class AgentClient {
  readonly baseUrl: URL;
  readonly accessToken: AccessToken | undefined;

  private readonly fetchTransport: FetchLike;
  private readonly socketFactory: WebSocketFactory | undefined;
  private readonly routes: AgentClientRoutes;

  constructor(options: AgentClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.accessToken = options.accessToken;
    this.fetchTransport = options.fetch ?? resolveFetch();
    this.socketFactory = options.webSocketFactory;
    this.routes = { ...defaultRoutes, ...options.routes };
  }

  withAccessToken(accessToken: AccessToken): AgentClient {
    return new AgentClient({
      baseUrl: this.baseUrl.href,
      accessToken,
      fetch: this.fetchTransport,
      ...(this.socketFactory === undefined ? {} : { webSocketFactory: this.socketFactory }),
      routes: this.routes,
    });
  }

  createGame(request: CreateLobbyRequest): Promise<CreateLobbyResponse> {
    return this.request(
      "POST",
      this.routes.createGame,
      request,
      false,
      CreateLobbyResponseSchema,
    );
  }

  joinGame(request: JoinLobbyRequest): Promise<JoinLobbyResponse> {
    return this.request(
      "POST",
      this.routes.joinGame,
      request,
      false,
      JoinLobbyResponseSchema,
    );
  }

  getState(gameId: GameId): Promise<ViewerStateEnvelope> {
    return this.request(
      "GET",
      this.routes.state(gameId),
      undefined,
      true,
      ViewerStateEnvelopeSchema,
    );
  }

  sendCommand(gameId: GameId, request: CommandEnvelope): Promise<CommandAccepted> {
    if (gameId !== request.gameId) {
      throw new Error("Command gameId must match the requested game");
    }
    return this.request(
      "POST",
      this.routes.commands(gameId),
      request,
      true,
      CommandAcceptedSchema,
    );
  }

  getReplay(gameId: GameId): Promise<ReplayResponse> {
    return this.request(
      "GET",
      this.routes.replay(gameId),
      undefined,
      true,
      ReplayResponseSchema
    );
  }

  subscribe(gameId: GameId, options: EventStreamOptions = {}): AgentEventStream {
    const frame = ClientWebSocketFrameSchema.parse({
      type: "authenticate",
      gameId,
      accessToken: this.requireAccessToken(),
      ...(options.afterSequence === undefined
        ? {}
        : { afterSequence: options.afterSequence }),
    });
    const socketFactory = this.socketFactory ?? resolveWebSocketFactory();
    const socket = socketFactory(toWebSocketUrl(this.baseUrl, this.routes.events(gameId)));
    return new AgentEventStream(socket, frame, options.signal);
  }

  private async request<T>(
    method: "GET" | "POST",
    route: string,
    body: unknown,
    authenticated: boolean,
    parser: ResponseParser<T>,
  ): Promise<T> {
    const headers = new Headers({ accept: "application/json" });
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (authenticated) {
      headers.set("authorization", `Bearer ${this.requireAccessToken()}`);
    }

    const response = await this.fetchTransport(new URL(trimLeadingSlash(route), this.baseUrl), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new AgentClientError(
        response.status,
        errorMessage(response.status, responseBody),
        responseBody,
      );
    }
    return parser.parse(responseBody);
  }

  private requireAccessToken(): AccessToken {
    if (this.accessToken === undefined || this.accessToken.length === 0) {
      throw new Error("An access token is required for this operation");
    }
    return this.accessToken;
  }
}

interface ResponseParser<T> {
  parse(input: unknown): T;
}

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

function trimLeadingSlash(route: string): string {
  return route.startsWith("/") ? route.slice(1) : route;
}

function toWebSocketUrl(baseUrl: URL, route: string): string {
  const url = new URL(trimLeadingSlash(route), baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function resolveFetch(): FetchLike {
  if (globalThis.fetch === undefined) {
    throw new Error("No fetch implementation is available; provide AgentClientOptions.fetch");
  }
  return globalThis.fetch.bind(globalThis);
}

function resolveWebSocketFactory(): WebSocketFactory {
  if (globalThis.WebSocket === undefined) {
    throw new Error(
      "No WebSocket implementation is available; provide AgentClientOptions.webSocketFactory",
    );
  }
  return (url) => new globalThis.WebSocket(url) as unknown as WebSocketLike;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AgentClientError(response.status, "Server returned invalid JSON", text);
  }
}

function errorMessage(status: number, body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return `Request failed with status ${status}`;
}

function parseSocketFrame(data: unknown): ServerWebSocketFrame {
  const json =
    typeof data === "string"
      ? data
      : data instanceof ArrayBuffer
        ? new TextDecoder().decode(data)
        : ArrayBuffer.isView(data)
          ? new TextDecoder().decode(data)
          : undefined;
  if (json === undefined) {
    throw new Error("WebSocket event frame must contain JSON text");
  }
  return ServerWebSocketFrameSchema.parse(JSON.parse(json) as unknown);
}
