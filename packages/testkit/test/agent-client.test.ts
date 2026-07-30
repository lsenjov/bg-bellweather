import {
  AccessTokenSchema,
  GameIdempotencyKeySchema,
  GameIdSchema,
  type CommandEnvelope,
} from "@bellwether/protocol";
import { describe, expect, it } from "vitest";
import {
  AgentClient,
  type FetchLike,
  type WebSocketCloseEvent,
  type WebSocketLike,
  type WebSocketMessageEvent,
} from "../src/index.js";

const gameId = GameIdSchema.parse("018f47d2-7830-7b84-a854-1b741f285f5d");
const accessToken = AccessTokenSchema.parse("a".repeat(32));
const idempotencyKey = GameIdempotencyKeySchema.parse("command-1");

const command: CommandEnvelope = {
  gameId,
  idempotencyKey,
  expectedVersion: 3,
  command: {
    type: "post_chat",
    message: "Ready for the next round",
  },
};

describe("AgentClient HTTP transport", () => {
  it("sends authenticated commands and validates the response", async () => {
    let requestedUrl = "";
    let authorization = "";
    const fetchTransport: FetchLike = async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        gameId,
        idempotencyKey,
        version: 4,
        latestSequence: 11,
      });
    };
    const client = new AgentClient({
      baseUrl: "http://localhost:3000",
      accessToken,
      fetch: fetchTransport,
    });

    await expect(client.sendCommand(gameId, command)).resolves.toMatchObject({
      version: 4,
      latestSequence: 11,
    });
    expect(requestedUrl).toBe(
      `http://localhost:3000/api/v1/games/${gameId}/commands`,
    );
    expect(authorization).toBe(`Bearer ${accessToken}`);
  });

  it("rejects a successful response that violates the protocol", async () => {
    const client = new AgentClient({
      baseUrl: "http://localhost:3000",
      accessToken,
      fetch: async () => Response.json({ accepted: true }),
    });

    await expect(client.sendCommand(gameId, command)).rejects.toThrow();
  });
});

describe("AgentClient event stream", () => {
  it("authenticates with a resume sequence and yields validated frames", async () => {
    const socket = new FakeSocket();
    let socketUrl = "";
    const client = new AgentClient({
      baseUrl: "https://bellwether.test",
      accessToken,
      webSocketFactory: (url) => {
        socketUrl = url;
        return socket;
      },
    });

    const stream = client.subscribe(gameId, { afterSequence: 9 });
    socket.emitOpen();
    socket.emitMessage(
      JSON.stringify({
        type: "authenticated",
        gameId,
        latestSequence: 12,
      }),
    );

    expect(socketUrl).toBe(
      `wss://bellwether.test/api/v1/games/${gameId}/events`,
    );
    expect(JSON.parse(socket.sent[0] ?? "")).toEqual({
      type: "authenticate",
      gameId,
      accessToken,
      afterSequence: 9,
    });
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: {
        type: "authenticated",
        gameId,
        latestSequence: 12,
      },
    });
  });

  it("closes the stream when a server frame violates the protocol", async () => {
    const socket = new FakeSocket();
    const client = new AgentClient({
      baseUrl: "http://localhost:3000",
      accessToken,
      webSocketFactory: () => socket,
    });
    const stream = client.subscribe(gameId);

    socket.emitOpen();
    socket.emitMessage(JSON.stringify({ type: "event", event: null }));

    await expect(stream.next()).rejects.toThrow();
    expect(socket.closed).toEqual({ code: 1007, reason: "Invalid event frame" });
  });
});

class FakeSocket implements WebSocketLike {
  readonly readyState = 0;
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | undefined;

  private openListener: (() => void) | undefined;
  private messageListener: ((event: WebSocketMessageEvent) => void) | undefined;
  private errorListener: (() => void) | undefined;
  private closeListener: ((event: WebSocketCloseEvent) => void) | undefined;

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: WebSocketMessageEvent) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(
    type: "close",
    listener: (event: WebSocketCloseEvent) => void,
  ): void;
  addEventListener(type: string, listener: unknown): void {
    if (type === "open") {
      this.openListener = listener as () => void;
    } else if (type === "message") {
      this.messageListener = listener as (event: WebSocketMessageEvent) => void;
    } else if (type === "error") {
      this.errorListener = listener as () => void;
    } else if (type === "close") {
      this.closeListener = listener as (event: WebSocketCloseEvent) => void;
    }
  }

  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(
    type: "message",
    listener: (event: WebSocketMessageEvent) => void,
  ): void;
  removeEventListener(type: "error", listener: () => void): void;
  removeEventListener(
    type: "close",
    listener: (event: WebSocketCloseEvent) => void,
  ): void;
  removeEventListener(type: string, listener: unknown): void {
    if (type === "open" && listener === this.openListener) {
      this.openListener = undefined;
    } else if (type === "message" && listener === this.messageListener) {
      this.messageListener = undefined;
    } else if (type === "error" && listener === this.errorListener) {
      this.errorListener = undefined;
    } else if (type === "close" && listener === this.closeListener) {
      this.closeListener = undefined;
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = {
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    };
  }

  emitOpen(): void {
    this.openListener?.();
  }

  emitMessage(data: unknown): void {
    this.messageListener?.({ data });
  }
}
