import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PARTY_IDS } from "@bellweather/content";
import { executeAction, type GameState } from "@bellweather/game";
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
  it("serves a built browser app with SPA fallback", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
    temporaryDirectories.push(directory);
    const webRoot = resolve(directory, "web");
    mkdirSync(webRoot);
    writeFileSync(resolve(webRoot, "index.html"), "<main>Bellweather</main>");
    writeFileSync(resolve(webRoot, "app.js"), "globalThis.BELLWEATHER = true");
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      webRoot,
      port: 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const home = await fetch(new URL("/", baseUrl));
    const route = await fetch(new URL("/games/example", baseUrl));
    const asset = await fetch(new URL("/app.js", baseUrl));
    expect(await home.text()).toContain("Bellweather");
    expect(await route.text()).toContain("Bellweather");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
    const malformedSocket = new WebSocket(
      `ws://${address.host}:${address.port}/api/v1/games/%/events`
    );
    await new Promise<void>((resolveRejected) => {
      malformedSocket.once("error", () => resolveRejected());
      malformedSocket.once("close", () => resolveRejected());
    });
    expect(
      await (
        await fetch(new URL("/", baseUrl))
      ).text()
    ).toContain("Bellweather");
    await app.close();
  });

  it("persists an authenticated lobby and processes idempotent commands", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        }
      }
    });
    expect(created.status).toBe(201);
    const createBody = created.body as {
      inviteCode: string;
      session: { gameId: string; accessToken: string };
      state: {
        publicState: {
          inviteCode: string;
          latestSequence: number;
          configuration: { playerCount: number };
        };
      };
    };
    expect(createBody.state.publicState.inviteCode).toBe(createBody.inviteCode);
    expect(createBody.state.publicState.latestSequence).toBe(1);
    expect(createBody.state.publicState.configuration.playerCount).toBe(1);

    const prematureStart = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: {
          gameId: createBody.session.gameId,
          idempotencyKey: "start-one-player",
          expectedVersion: 1,
          command: { type: "start_game" }
        }
      }
    );
    expect(prematureStart).toMatchObject({
      status: 409,
      body: {
        error: {
          code: "illegal_action",
          message: "At least 2 players are required"
        }
      }
    });

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
    const joinBody = joined.body as {
      session: { seatId: string; accessToken: string };
    };

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
    const lobbySocket = await authenticatedSocket(
      address.port,
      createBody.session.gameId,
      createBody.session.accessToken,
      2
    );
    lobbySocket.close();

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
    const activeState = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/state`,
      { token: createBody.session.accessToken }
    );
    expect(activeState.body).toMatchObject({
      publicState: {
        lifecycle: "active",
        configuration: { playerCount: 2 }
      }
    });
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
    const gift = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/commands`,
      {
        method: "POST",
        token: createBody.session.accessToken,
        body: {
          gameId: createBody.session.gameId,
          idempotencyKey: "gift-once",
          expectedVersion: 5,
          command: {
            type: "give_resources",
            recipientSeatId: joinBody.session.seatId,
            leverage: 0,
            bluff: 0,
            operations: { organise: 0, rally: 0, smear: 0, court: 0 },
            points: 2
          }
        }
      }
    );
    expect(gift.status).toBe(200);
    const afterGift = await jsonRequest(
      baseUrl,
      `/api/v1/games/${createBody.session.gameId}/state`,
      { token: joinBody.session.accessToken }
    );
    expect(
      (
        afterGift.body as {
          publicState: {
            publicGame: { seats: Array<{ id: string; points: number }> };
          };
        }
      ).publicState.publicGame.seats.map(({ points }) => points)
    ).toEqual([8, 12]);

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
      latestSequence: 6,
      seats: [{ ready: true }, { ready: false }]
    });
    await reopened.close();
  });

  it.each([2, 3, 4, 5, 6])(
    "starts a lobby with %i occupied player seats",
    async (playerCount) => {
      const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
            counterbidTimer: { mode: "off" },
            allowSpectators: false
          }
        }
      });
      const host = created.body as {
        inviteCode: string;
        session: { gameId: string; accessToken: string };
      };

      for (let seat = 1; seat < playerCount; seat += 1) {
        const joined = await jsonRequest(baseUrl, "/api/v1/games/join", {
          method: "POST",
          body: {
            inviteCode: host.inviteCode,
            displayName: `Player ${seat + 1}`,
            controller: "human",
            role: "player"
          }
        });
        expect(joined.status).toBe(201);
      }

      if (playerCount === 6) {
        const seventh = await jsonRequest(baseUrl, "/api/v1/games/join", {
          method: "POST",
          body: {
            inviteCode: host.inviteCode,
            displayName: "Player 7",
            controller: "human",
            role: "player"
          }
        });
        expect(seventh).toMatchObject({
          status: 409,
          body: { error: { code: "lobby_full" } }
        });
      }

      const started = await jsonRequest(
        baseUrl,
        `/api/v1/games/${host.session.gameId}/commands`,
        {
          method: "POST",
          token: host.session.accessToken,
          body: {
            gameId: host.session.gameId,
            idempotencyKey: `start-${playerCount}-players`,
            expectedVersion: playerCount,
            command: { type: "start_game" }
          }
        }
      );
      expect(started.status).toBe(200);

      const state = await jsonRequest(
        baseUrl,
        `/api/v1/games/${host.session.gameId}/state`,
        { token: host.session.accessToken }
      );
      expect(state.body).toMatchObject({
        publicState: {
          lifecycle: "active",
          configuration: { playerCount },
          publicGame: {
            seats: expect.arrayContaining(
              Array.from({ length: playerCount }, () => expect.any(Object))
            )
          }
        }
      });
      expect(
        (
          state.body as {
            publicState: { publicGame: { seats: unknown[] } };
          }
        ).publicState.publicGame.seats
      ).toHaveLength(playerCount);
      await app.close();
    }
  );

  it("migrates fixed lobby seat counts to the shared six-player capacity", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
    temporaryDirectories.push(directory);
    const databasePath = resolve(directory, "game.sqlite");
    const app = createAppServer({ databasePath, port: 0 });
    const address = await app.listen();
    const created = await jsonRequest(
      `http://${address.host}:${address.port}`,
      "/api/v1/games",
      {
        method: "POST",
        body: {
          displayName: "Host",
          controller: "human",
          configuration: {
            counterbidTimer: { mode: "off" },
            allowSpectators: false
          }
        }
      }
    );
    const gameId = (created.body as { session: { gameId: string } }).session.gameId;
    app.store.database
      .prepare("UPDATE games SET settings_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          seatCount: 3,
          counterbidTimerSeconds: null,
          allowSpectators: false
        }),
        gameId
      );
    app.store.database
      .prepare("DELETE FROM schema_migrations WHERE name = ?")
      .run("0002_variable_player_lobbies.sql");
    await app.close();

    const reopened = createAppServer({ databasePath, port: 0 });
    await reopened.listen();
    expect(reopened.store.resolveGame(gameId).settings).toEqual({
      playerCapacity: 6,
      counterbidTimerSeconds: null,
      allowSpectators: false
    });
    await reopened.close();
  });

  it("rejects unsupported persisted games without disrupting startup", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
    temporaryDirectories.push(directory);
    const databasePath = resolve(directory, "game.sqlite");
    const app = createAppServer({
      databasePath,
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
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        }
      }
    });
    const host = created.body as {
      inviteCode: string;
      session: { gameId: string; accessToken: string };
    };
    await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Opponent",
        controller: "human",
        role: "player"
      }
    });
    app.store.database
      .prepare("UPDATE games SET ruleset_version = '6' WHERE id = ?")
      .run(host.session.gameId);

    const response = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: host.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "start-unsupported",
          expectedVersion: 2,
          command: { type: "start_game" }
        }
      }
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: "unsupported_ruleset" }
    });

    app.store.database
      .prepare("UPDATE games SET ruleset_version = '11' WHERE id = ?")
      .run(host.session.gameId);
    await sendCommand(baseUrl, host.session, 2, "start-current", {
      type: "start_game"
    });
    app.store.database
      .prepare("UPDATE games SET ruleset_version = '6' WHERE id = ?")
      .run(host.session.gameId);
    const unsupportedSocket = await openSocket(address.port, host.session.gameId);
    const unsupportedFrame = nextSocketFrame(unsupportedSocket);
    unsupportedSocket.send(JSON.stringify({
      type: "authenticate",
      gameId: host.session.gameId,
      accessToken: host.session.accessToken
    }));
    await expect(unsupportedFrame).resolves.toMatchObject({
      type: "error",
      error: { code: "unsupported_ruleset" }
    });

    app.store.database
      .prepare("UPDATE games SET ruleset_version = '11' WHERE id = ?")
      .run(host.session.gameId);
    app.store.database
      .prepare("UPDATE snapshots SET ruleset_version = '6' WHERE game_id = ?")
      .run(host.session.gameId);

    expect(() => app.store.loadEngineState(host.session.gameId)).toThrow(
      "Only ruleset 11 is supported"
    );
    const retry = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: host.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "start-current",
          expectedVersion: 2,
          command: { type: "start_game" }
        }
      }
    );
    expect(retry).toMatchObject({
      status: 409,
      body: { error: { code: "unsupported_ruleset" } }
    });

    const resumeSocket = await openSocket(address.port, host.session.gameId);
    const resumeFrame = nextSocketFrame(resumeSocket);
    resumeSocket.send(JSON.stringify({
      type: "authenticate",
      gameId: host.session.gameId,
      accessToken: host.session.accessToken,
      afterSequence: 3
    }));
    await expect(resumeFrame).resolves.toMatchObject({
      type: "error",
      error: { code: "unsupported_ruleset" }
    });

    app.store.database
      .prepare("UPDATE games SET status = 'finished' WHERE id = ?")
      .run(host.session.gameId);
    const replay = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/replay`,
      { token: host.session.accessToken }
    );
    expect(replay).toMatchObject({
      status: 409,
      body: { error: { code: "unsupported_ruleset" } }
    });
    app.store.database
      .prepare("UPDATE games SET status = 'active' WHERE id = ?")
      .run(host.session.gameId);
    await app.close();

    const reopened = createAppServer({ databasePath, port: 0 });
    const reopenedAddress = await reopened.listen();
    const health = await jsonRequest(
      `http://${reopenedAddress.host}:${reopenedAddress.port}`,
      "/api/v1/health"
    );
    expect(health).toMatchObject({ status: 200 });
    await reopened.close();
  });

  it("allows configured spectators to join active games without granting player commands", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
          counterbidTimer: { mode: "countdown", durationSeconds: 90 },
          allowSpectators: true
        }
      }
    });
    const host = created.body as {
      inviteCode: string;
      session: { gameId: string; accessToken: string };
    };
    const playerJoined = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Player",
        controller: "human",
        role: "player"
      }
    });
    expect(playerJoined.status).toBe(201);
    const player = playerJoined.body as {
      session: { accessToken: string };
    };
    await sendCommand(baseUrl, host.session, 2, "start-for-observer", {
      type: "start_game"
    });
    const hostSocket = await authenticatedSocket(
      address.port,
      host.session.gameId,
      host.session.accessToken,
      3
    );
    const spectatorJoinedEvent = nextSocketFrame(hostSocket);

    const joined = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Observer",
        controller: "agent",
        role: "spectator"
      }
    });
    expect(joined.status).toBe(201);
    const spectator = joined.body as {
      session: { accessToken: string };
      state: {
        scope: string;
        publicState: {
          inviteCode: string;
          lifecycle: string;
          spectators: unknown[];
        };
      };
    };
    expect(spectator.state.scope).toBe("public");
    expect(spectator.state.publicState.inviteCode).toBe(host.inviteCode);
    expect(spectator.state.publicState.lifecycle).toBe("active");
    expect(spectator.state.publicState.spectators).toHaveLength(1);
    await expect(spectatorJoinedEvent).resolves.toMatchObject({
      type: "event",
      event: {
        eventType: "spectator.joined",
        sequence: 4,
        scope: "public"
      }
    });

    const commandAfterPresenceChange = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: host.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "chat-after-observer",
          expectedVersion: 3,
          command: { type: "post_chat", message: "Welcome" }
        }
      }
    );
    expect(commandAfterPresenceChange).toMatchObject({
      status: 200,
      body: { version: 5, latestSequence: 5 }
    });

    const staleGameplayCommand = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: player.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "stale-after-chat",
          expectedVersion: 3,
          command: { type: "post_chat", message: "Stale" }
        }
      }
    );
    expect(staleGameplayCommand).toMatchObject({
      status: 409,
      body: { error: { code: "version_conflict" } }
    });

    const command = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: spectator.session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "spectator-command",
          expectedVersion: 5,
          command: { type: "post_chat", message: "Hello" }
        }
      }
    );
    expect(command.status).toBe(403);
    hostSocket.close();

    app.store.database
      .prepare("UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?")
      .run(new Date().toISOString(), host.session.gameId);
    const joinedAfterCompletion = await jsonRequest(
      baseUrl,
      "/api/v1/games/join",
      {
        method: "POST",
        body: {
          inviteCode: host.inviteCode,
          displayName: "Late Observer",
          controller: "human",
          role: "spectator"
        }
      }
    );
    expect(joinedAfterCompletion).toMatchObject({
      status: 409,
      body: { error: { code: "phase_closed" } }
    });
    await app.close();
  });

  it("keeps active admission closed for players and disabled spectators", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
          counterbidTimer: { mode: "off" },
          allowSpectators: false
        }
      }
    });
    const host = created.body as {
      inviteCode: string;
      session: { gameId: string; accessToken: string };
    };
    await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Player",
        controller: "human",
        role: "player"
      }
    });
    await sendCommand(baseUrl, host.session, 2, "start-closed-game", {
      type: "start_game"
    });

    const spectator = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Observer",
        controller: "human",
        role: "spectator"
      }
    });
    expect(spectator).toMatchObject({
      status: 403,
      body: { error: { code: "forbidden" } }
    });

    const player = await jsonRequest(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: "Late Player",
        controller: "human",
        role: "player"
      }
    });
    expect(player).toMatchObject({
      status: 409,
      body: { error: { code: "illegal_action" } }
    });
    await app.close();
  });

  it("returns illegal operation choices without advancing the decision", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
        displayName: "Ada",
        controller: "human",
        configuration: {
          counterbidTimer: { mode: "off" },
          allowSpectators: false
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
        displayName: "Turing",
        controller: "human",
        role: "player"
      }
    });
    const guest = joined.body as {
      session: { gameId: string; seatId: string; accessToken: string };
    };
    await sendCommand(baseUrl, host.session, 2, "start", {
      type: "start_game"
    });

    let state = app.store.loadEngineState(host.session.gameId)!;
    let hostOperationCommitted = false;
    while (state.phase.type === "opening") {
      const seatId = state.phase.turnSeatIds[state.phase.turnIndex]!;
      const seat = state.seats.find((candidate) => candidate.id === seatId)!;
      const partyId = PARTY_IDS.find(
        (candidate) => state.contests[candidate] === undefined
      )!;
      const includeOperation =
        seatId === host.session.seatId && !hostOperationCommitted;
      state = executeAction(state, {
        type: "submit_openings",
        seatId,
        now: 1,
        openings: [{
          firmId: seat.firmIds[0]!,
          partyId,
          leverage: 1,
          bluff: 0,
          operations: {
            organise: includeOperation ? 1 : 0,
            rally: 0,
            smear: 0,
            court: 0
          }
        }]
      }).state;
      hostOperationCommitted ||= includeOperation;
    }
    for (const seat of state.seats) {
      state = executeAction(state, {
        type: "set_counterbid_ready",
        seatId: seat.id,
        ready: true,
        now: 1
      }).state;
      if (state.phase.type !== "counterbidding") {
        break;
      }
    }
    if (
      state.phase.type !== "resolution" ||
      state.phase.pendingDecision?.kind !== "party_operation"
    ) {
      throw new Error("Expected a party operation decision");
    }
    const decision = state.phase.pendingDecision;
    const version = 3;
    app.store.saveSnapshot(
      host.session.gameId,
      version,
      state.rulesetVersion,
      state,
      new Date().toISOString()
    );
    const session =
      decision.seatId === host.session.seatId ? host.session : guest.session;

    const response = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: session.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "illegal-organise",
          expectedVersion: version,
          command: {
            type: "game_action",
            action: {
              type: "resolve_party_operation",
              decisionId: decision.id,
              operation: "organise",
              choice: {
                operation: "organise",
                sourceDistrictId: "harbormouth",
                destinationDistrictId: "northreach"
              }
            }
          }
        }
      }
    );

    expect(response).toMatchObject({
      status: 409,
      body: {
        error: {
          code: "illegal_action",
          message: "Organise destination must neighbor the source"
        }
      }
    });
    const unchanged = app.store.loadEngineState(host.session.gameId) as GameState;
    expect(unchanged.phase).toMatchObject({
      type: "resolution",
      pendingDecision: { id: decision.id }
    });
    await app.close();
  });

  it("redacts canonical engine events from opponents and spectators", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
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
    const opponent = joined.body as {
      session: { seatId: string; accessToken: string };
    };
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

    const wrongRouteSocket = await openSocket(
      address.port,
      "00000000-0000-4000-8000-000000000000"
    );
    const wrongRouteFrame = nextSocketFrame(wrongRouteSocket);
    wrongRouteSocket.send(
      JSON.stringify({
        type: "authenticate",
        gameId: host.session.gameId,
        accessToken: host.session.accessToken,
        afterSequence: 4
      })
    );
    await expect(wrongRouteFrame).resolves.toMatchObject({
      type: "error",
      error: { code: "not_found" }
    });

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
    const activeState = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/state`,
      { token: host.session.accessToken }
    );
    const active = activeState.body as {
      seatState: {
        privateGame: {
          reserve: unknown;
          scoringCardIds: string[];
        };
      };
      publicState: {
        publicGame: {
          phase: {
            activeSeatId: string;
            turnSeatIds: string[];
            turnIndex: number;
          };
          partyOrder: string[];
          courtSupport: Record<string, Record<string, number>>;
          seats: Array<{ id: string; firmIds: string[] }>;
        };
      };
    };
    const publicGameJson = JSON.stringify(active.publicState.publicGame);
    expect(publicGameJson).not.toContain("scoringCardIds");
    expect(publicGameJson).not.toContain('"reserve"');
    expect(active.publicState.publicGame.courtSupport).toEqual({
      honeycomb: {},
      "old-shell": {},
      foxglove: {},
      riverworks: {},
      "many-wings": {},
      "night-parliament": {}
    });
    expect(active.seatState.privateGame).toMatchObject({
      scoringCardIds: [expect.any(String), expect.any(String)],
      reserve: {
        leverage: 20,
        bluff: 8,
        operations: { organise: 4, rally: 8, smear: 4, court: 4 },
        points: 10
      }
    });
    expect(active.publicState.publicGame.phase.turnSeatIds).toHaveLength(4);
    expect(active.publicState.publicGame.phase.turnIndex).toBe(0);
    expect(active.publicState.publicGame.phase.activeSeatId).toBe(
      active.publicState.publicGame.phase.turnSeatIds[0]
    );
    const actor =
      active.publicState.publicGame.phase.activeSeatId === host.session.seatId
        ? host.session
        : { ...opponent.session, gameId: host.session.gameId };
    const firms = active.publicState.publicGame.seats.find(
      (seat) => seat.id === actor.seatId
    )!.firmIds;
    const emptyOperations = { organise: 0, rally: 0, smear: 0, court: 0 };
    await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/commands`,
      {
        method: "POST",
        token: actor.accessToken,
        body: {
          gameId: host.session.gameId,
          idempotencyKey: "private-action",
          expectedVersion: 4,
          command: {
            type: "game_action",
            action: {
              type: "submit_openings",
              openings: [
                {
                  firmId: firms[0],
                  partyId: active.publicState.publicGame.partyOrder[0],
                  leverage: 1,
                  bluff: 1,
                  operations: { ...emptyOperations, organise: 1 }
                }
              ]
            }
          }
        }
      }
    );
    const coveredState = await jsonRequest(
      baseUrl,
      `/api/v1/games/${host.session.gameId}/state`,
      { token: observer.session.accessToken }
    );
    const coveredContests = (
      coveredState.body as {
        publicState: {
          publicGame: {
            contests: Record<string, { bids: Array<Record<string, unknown>> }>;
          };
        };
      }
    ).publicState.publicGame.contests;
    const coveredBid = Object.values(coveredContests)
      .flatMap((contest) => contest.bids)
      .find((bid) => bid.firmId === firms[0]);
    expect(coveredBid).toMatchObject({ leverage: 1, cardCount: 3 });
    expect(coveredBid).not.toHaveProperty("bluff");
    expect(coveredBid).not.toHaveProperty("operations");
    await expect(opponentEvent).resolves.toMatchObject({
      type: "event",
      event: {
        eventType: "game.action_applied",
        scope: "public",
        publicData: {
          actions: [{ type: "submit_openings", seatId: actor.seatId }]
        }
      }
    });
    await expect(observerEvent).resolves.toMatchObject({
      type: "event",
      event: {
        eventType: "game.action_applied",
        scope: "public",
        publicData: {
          actions: [{ type: "submit_openings", seatId: actor.seatId }]
        }
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
      actorSeatId: actor.seatId,
      visibility: "public",
      privateSeatId: null
    });
    await app.close();
  });

  it("recovers and expires a counterbid deadline after restart", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
    temporaryDirectories.push(directory);
    const databasePath = resolve(directory, "game.sqlite");
    let clock = new Date("2026-07-30T12:00:00.000Z");
    const serverOptions = {
      databasePath,
      port: 0,
      now: () => clock,
      randomInteger: () => 0
    };
    const app = createAppServer(serverOptions);
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const created = await jsonRequest(baseUrl, "/api/v1/games", {
      method: "POST",
      body: {
        displayName: "Host",
        controller: "human",
        configuration: {
          counterbidTimer: { mode: "countdown", durationSeconds: 5 },
          allowSpectators: false
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
    const opponent = (joined.body as {
      session: { seatId: string; accessToken: string };
    }).session;
    await sendCommand(baseUrl, host.session, 2, "start-timer", {
      type: "start_game"
    });

    let version = 3;
    for (let turnIndex = 0; turnIndex < 4; turnIndex += 1) {
      const state = await jsonRequest(
        baseUrl,
        `/api/v1/games/${host.session.gameId}/state`,
        { token: host.session.accessToken }
      );
      const view = state.body as {
        publicState: {
          publicGame: {
            phase: {
              activeSeatId: string;
              turnSeatIds: string[];
              turnIndex: number;
            };
            partyOrder: string[];
            seats: Array<{ id: string; firmIds: string[] }>;
            contests: Record<string, unknown>;
          };
        };
      };
      const activeSeatId = view.publicState.publicGame.phase.activeSeatId;
      expect(view.publicState.publicGame.phase).toMatchObject({
        turnSeatIds: [
          host.session.seatId,
          opponent.seatId,
          opponent.seatId,
          host.session.seatId
        ],
        turnIndex,
        activeSeatId
      });
      const session = activeSeatId === host.session.seatId
        ? host.session
        : opponent;
      const firms = view.publicState.publicGame.seats.find(
        (seat) => seat.id === activeSeatId
      )!.firmIds;
      const openParties = new Set(
        Object.keys(view.publicState.publicGame.contests).filter(
          (contestId) => contestId !== "pecking-order"
        )
      );
      const parties = view.publicState.publicGame.partyOrder
        .filter((partyId) => !openParties.has(partyId))
        .slice(0, 1);
      await sendCommand(
        baseUrl,
        { ...session, gameId: host.session.gameId },
        version,
        `open-${turnIndex}-${session.seatId}`,
        {
          type: "game_action",
          action: {
            type: "submit_openings",
            openings: parties.map((partyId) => ({
              firmId: firms[0],
              partyId,
              leverage: 1,
              bluff: 0,
              operations: { organise: 0, rally: 0, smear: 0, court: 0 }
            }))
          }
        }
      );
      version += 1;
    }

    const waiting = app.store.loadEngineState(host.session.gameId);
    expect(waiting?.phase).toMatchObject({
      type: "counterbidding",
      deadlineAt: clock.getTime() + 5_000
    });
    await app.close();

    clock = new Date(clock.getTime() + 6_000);
    const reopened = createAppServer(serverOptions);
    const reopenedAddress = await reopened.listen();
    const reopenedBase = `http://${reopenedAddress.host}:${reopenedAddress.port}`;
    let recovered:
      | {
          publicState: {
            latestSequence: number;
            publicGame: { phase: { type: string }; round: number };
          };
        }
      | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await jsonRequest(
        reopenedBase,
        `/api/v1/games/${host.session.gameId}/state`,
        { token: host.session.accessToken }
      );
      recovered = state.body as typeof recovered;
      if (recovered?.publicState.publicGame.phase.type !== "counterbidding") {
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    expect(recovered?.publicState.latestSequence).toBe(8);
    expect(recovered?.publicState.publicGame).toMatchObject({
      round: 2,
      phase: { type: "opening" }
    });
    await reopened.close();
  });
});

async function sendCommand(
  baseUrl: string,
  session: { gameId: string; accessToken: string },
  expectedVersion: number,
  idempotencyKey: string,
  command: unknown
): Promise<void> {
  const response = await jsonRequest(
    baseUrl,
    `/api/v1/games/${session.gameId}/commands`,
    {
      method: "POST",
      token: session.accessToken,
      body: {
        gameId: session.gameId,
        idempotencyKey,
        expectedVersion,
        command
      }
    }
  );
  expect(response.status).toBe(200);
}

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
  const socket = await openSocket(port, gameId);
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

async function openSocket(port: number, gameId: string): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/v1/games/${gameId}/events`
  );
  await new Promise<void>((resolveOpen, reject) => {
    socket.once("open", resolveOpen);
    socket.once("error", reject);
  });
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
