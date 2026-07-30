import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createAppServer } from "../src/server.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("game server", () => {
  it("persists an authenticated lobby and processes idempotent commands", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellwether-server-"));
    temporaryDirectories.push(directory);
    const databasePath = resolve(directory, "game.sqlite");
    const app = createAppServer({ databasePath, port: 0 });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;

    const created = await jsonRequest(baseUrl, "/api/v1/games", {
      method: "POST",
      body: {
        displayName: "Ada",
        controller: "human",
        configuration: {
          playerCount: 2,
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        }
      }
    });
    expect(created.status).toBe(201);
    const createBody = created.body as {
      inviteCode: string;
      session: { gameId: string; accessToken: string };
      state: { publicState: { latestSequence: number } };
    };
    expect(createBody.state.publicState.latestSequence).toBe(1);

    const joined = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: createBody.inviteCode,
        displayName: "Turing",
        controller: "agent",
        role: "player"
      }
    });
    expect(joined.status).toBe(201);

    const unauthorized = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/state`,
      { token: "x".repeat(43) }
    );
    expect(unauthorized.status).toBe(401);

    const state = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/state`,
      { token: createBody.session.accessToken }
    );
    expect(state.status).toBe(200);
    expect(
      (state.body as { publicState: { seats: unknown[] } }).publicState.seats
    ).toHaveLength(2);

    const command = {
      gameId: createBody.session.gameId,
      idempotencyKey: "ready-once",
      expectedVersion: 2,
      command: { type: "set_lobby_ready", ready: true }
    };
    const accepted = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: command
      }
    );
    const repeated = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: command
      }
    );
    expect(repeated.body).toEqual(accepted.body);

    const started = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: {
          gameId: createBody.session.gameId,
          idempotencyKey: "start-once",
          expectedVersion: 3,
          command: { type: "start_game" }
        }
      }
    );
    expect(started.status).toBe(200);
    const chatCommand = {
      gameId: createBody.session.gameId,
      idempotencyKey: "chat-once",
      expectedVersion: 4,
      command: { type: "post_chat", message: "Welcome" }
    };
    const chat = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: chatCommand
      }
    );
    const chatRetry = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: chatCommand
      }
    );
    expect(chatRetry.body).toEqual(chat.body);
    expect(chatRetry.body).toMatchObject({
      gameId: createBody.session.gameId,
      idempotencyKey: "chat-once",
      version: 5,
      latestSequence: 5
    });
    const conflictingRetry = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: {
          ...chatCommand,
          command: { type: "post_chat", message: "Different" }
        }
      }
    );
    expect(conflictingRetry.status).toBe(409);
    expect(conflictingRetry.body).toMatchObject({
      error: { code: "idempotency_conflict" }
    });

    await app.close();

    const reopened = createAppServer({ databasePath, port: 0 });
    const reopenedAddress = await reopened.listen();
    const restored = await jsonRequest(
      `http://${reopenedAddress.host}:${reopenedAddress.port}`,
      `/api/v1/games/${createBody.session.gameId}/state`,
      { token: createBody.session.accessToken }
    );
    expect(restored.status).toBe(200);
    expect(
      (
        restored.body as {
          publicState: { latestSequence: number; seats: Array<{ ready: boolean }> };
        }
      ).publicState
    ).toMatchObject({
      latestSequence: 5,
      seats: [{ ready: true }, { ready: false }]
    });
    await reopened.close();
  });

  it("allows configured spectators without granting player commands", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellwether-server-"));
    temporaryDirectories.push(directory);
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const created = await jsonRequest(baseUrl, "/api/v1/games", {
      method: "POST",
      body: {
        displayName: "Host",
        controller: "human",
        configuration: {
          playerCount: 2,
          counterbidTimer: { mode: "countdown", durationSeconds: 90 },
          allowSpectators: true
        }
      }
    });
    const game = created.body as {
      inviteCode: string;
      session: { gameId: string };
    };
    const joined = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: game.inviteCode,
        displayName: "Observer",
        controller: "agent",
        role: "spectator"
      }
    });
    expect(joined.status).toBe(201);
    const spectator = joined.body as {
      session: { accessToken: string };
      state: { scope: string; publicState: { spectators: unknown[] } };
    };
    expect(spectator.state.scope).toBe("public");
    expect(spectator.state.publicState.spectators).toHaveLength(1);

    const command = await jsonRequest(
      baseUrl,
      `/api/v1/games/${game.session.gameId}/commands`,
      {
        method: "POST",
        token: spectator.session.accessToken,
        body: {
          gameId: game.session.gameId,
          idempotencyKey: "spectator-command",
          expectedVersion: 2,
          command: { type: "post_chat", message: "Hello" }
        }
      }
    );
    expect(command.status).toBe(403);
    await app.close();
  });

  it("redacts private command events from opponents and spectators", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellwether-server-"));
    temporaryDirectories.push(directory);
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const created = await jsonRequest(baseUrl, "/api/v1/games", {
      method: "POST",
      body: {
        displayName: "Host",
        controller: "human",
        configuration: {
          playerCount: 2,
          counterbidTimer: { mode: "off" },
          allowSpectators: true
        }
      }
    });
    const host = created.body as {
      inviteCode: string;
      session: { gameId: string; seatId: string; accessToken: string };
    };
    const joined = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Opponent",
        controller: "agent",
        role: "player"
      }
    });
    const opponent = joined.body as { session: { accessToken: string } };
    const watched = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Observer",
        controller: "agent",
        role: "spectator"
      }
    });
    const observer = watched.body as { session: { accessToken: string } };
    await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: host.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "start-private-test",
          expectedVersion: 3,
          command: { type: "start_game" }
        }
      }
    );

    const opponentSocket = await authenticatedSocket(
      address.port,
      host.session.gameId,
      opponent.session.accessToken,
      4
    );
    const observerSocket = await authenticatedSocket(
      address.port,
      host.session.gameId,
      observer.session.accessToken,
      4
    );
    const opponentEvent = nextSocketFrame(opponentSocket);
    const observerEvent = nextSocketFrame(observerSocket);
    await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: host.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "private-action",
          expectedVersion: 4,
          command: {
            type: "game_action",
            action: { type: "compose_counterbid", clout: 4 }
          }
        }
      }
    );
    await expect(opponentEvent).resolves.toMatchObject({
      type: "event",
      event: {
        eventType: "private_event",
        scope: "public",
        publicData: {}
      }
    });
    await expect(observerEvent).resolves.toMatchObject({
      type: "event",
      event: {
        eventType: "private_event",
        scope: "public",
        publicData: {}
      }
    });
    opponentSocket.close();
    observerSocket.close();
    app.store.database
      .prepare(
        "UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?"
      )
      .run("2026-07-30T12:00:00.000Z", host.session.gameId);
    const replay = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/replay`,
      { token: observer.session.accessToken }
    );
    expect(replay.status).toBe(200);
    const replayEvents = (
      replay.body as {
        events: Array<{
          fullData: {
            event: {
              actorSeatId: string | null;
              visibility: string;
              privateSeatId: string | null;
            };
          };
        }>;
      }
    ).events;
    expect(replayEvents.at(-1)?.fullData.event).toMatchObject({
      actorSeatId: host.session.seatId,
      visibility: "seat",
      privateSeatId: host.session.seatId
    });
    await app.close();
  });
});

async function jsonRequest(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.token !== undefined) {
    headers.set("authorization", `Bearer ${options.token}`);
  }
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) })
  });
  return {
    status: response.status,
    body: (await response.json()) as unknown
  };
}

async function authenticatedSocket(
  port: number,
  gameId: string,
  accessToken: string,
  afterSequence: number
): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/v1/games/${gameId}/events`
  );
  await new Promise<void>((resolveOpen, reject) => {
    socket.once("open", resolveOpen);
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      type: "authenticate",
      gameId,
      accessToken,
      afterSequence
    })
  );
  const authenticated = await nextSocketFrame(socket);
  expect(authenticated).toMatchObject({ type: "authenticated", gameId });
  return socket;
}

function nextSocketFrame(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolveFrame, reject) => {
    socket.once("message", (data) => {
      try {
        resolveFrame(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}
