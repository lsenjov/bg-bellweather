import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  it("serves the browser app with SPA fallback and rejects malformed sockets", async () => {
    const directory = temporaryDirectory();
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

    const malformedSocket = new WebSocket(
      `ws://${address.host}:${address.port}/api/v1/games/%/events`
    );
    await new Promise<void>((done) => {
      malformedSocket.once("error", done);
      malformedSocket.once("close", done);
    });
    await app.close();
  });

  it("persists authenticated games and processes commands idempotently", async () => {
    const directory = temporaryDirectory();
    const databasePath = resolve(directory, "game.sqlite");
    const app = createAppServer({ databasePath, port: 0, randomInteger: () => 0 });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const game = await createGame(baseUrl, 2);

    const readyCommand = envelope(game, "ready-once", game.version, {
      type: "set_lobby_ready",
      ready: true
    });
    const ready = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: game.sessions[0]!.accessToken,
      body: readyCommand
    });
    const retried = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: game.sessions[0]!.accessToken,
      body: readyCommand
    });
    expect(retried.body).toEqual(ready.body);
    expect(ready.status).toBe(200);
    game.version += 1;

    const conflict = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: game.sessions[0]!.accessToken,
      body: envelope(game, "ready-once", game.version, {
        type: "set_lobby_ready",
        ready: false
      })
    });
    expect(conflict).toMatchObject({
      status: 409,
      body: { error: { code: "idempotency_conflict" } }
    });

    await command(baseUrl, game, 0, "start", { type: "start_game" });
    await command(baseUrl, game, 0, "chat", {
      type: "post_chat",
      message: "Welcome to Year 1"
    });
    await app.close();

    const reopened = createAppServer({ databasePath, port: 0, randomInteger: () => 0 });
    const reopenedAddress = await reopened.listen();
    const restored = await state(
      `http://${reopenedAddress.host}:${reopenedAddress.port}`,
      game,
      0
    );
    expect(restored).toMatchObject({
      scope: "seat",
      publicState: {
        lifecycle: "active",
        latestSequence: game.version,
        configuration: { playerCount: 2, allowSpectators: false },
        publicGame: {
          year: 1,
          phase: "opening",
          chat: [{ text: "Welcome to Year 1" }]
        }
      }
    });
    expect(JSON.stringify(restored)).not.toContain("counterbid");
    await reopened.close();
  });

  it.each([2, 3, 4, 5, 6])(
    "starts with %i occupied player seats",
    async (playerCount) => {
      const directory = temporaryDirectory();
      const app = createAppServer({
        databasePath: resolve(directory, "game.sqlite"),
        port: 0,
        randomInteger: () => 0
      });
      const address = await app.listen();
      const baseUrl = `http://${address.host}:${address.port}`;
      const game = await createGame(baseUrl, playerCount);

      if (playerCount === 6) {
        const seventh = await request(baseUrl, "/api/v1/games/join", {
          method: "POST",
          body: {
            inviteCode: game.inviteCode,
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

      await command(baseUrl, game, 0, `start-${playerCount}`, {
        type: "start_game"
      });
      const view = await state(baseUrl, game, 0);
      const publicGame = view.publicState.publicGame as Record<string, unknown>;
      expect(view.publicState).toMatchObject({
        lifecycle: "active",
        configuration: { playerCount }
      });
      expect(publicGame.seats).toHaveLength(playerCount);
      expect(publicGame.phase).toBe("opening");
      await app.close();
    }
  );

  it("runs ABBA openings, Lobby Operations, collection, passes, and cleanup", async () => {
    const directory = temporaryDirectory();
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0,
      randomInteger: () => 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const game = await createGame(baseUrl, 2);
    await command(baseUrl, game, 0, "start", { type: "start_game" });

    const hostPrivate = await state(baseUrl, game, 0);
    const guestPrivate = await state(baseUrl, game, 1);
    expect(privateSeat(hostPrivate)).toMatchObject({
      firmIds: ["one-fell-swoop", "pairliament"],
      collectionCounters: 4
    });
    expect(privateSeat(guestPrivate)).toMatchObject({
      firmIds: ["triumvirat", "ivy-league"],
      collectionCounters: 4
    });

    await gameAction(baseUrl, game, 0, "open-a", {
      type: "open_party",
      firmId: "one-fell-swoop",
      partyId: "honeycomb"
    });
    await gameAction(baseUrl, game, 1, "open-b1", {
      type: "open_party",
      firmId: "triumvirat",
      partyId: "old-shell"
    });
    await gameAction(baseUrl, game, 1, "open-b2", {
      type: "open_party",
      firmId: "ivy-league",
      partyId: "foxglove"
    });
    await gameAction(baseUrl, game, 0, "open-a2", {
      type: "open_party",
      firmId: "pairliament",
      partyId: "riverworks"
    });

    let view = await state(baseUrl, game, 0);
    expect(view.publicState.publicGame).toMatchObject({
      phase: "lobby",
      phaseData: { activeSeatId: game.sessions[0]!.seatId }
    });

    await gameAction(baseUrl, game, 0, "operate", {
      type: "operate",
      partyId: "honeycomb",
      play: {
        operation: "organise",
        choice: {
          operation: "organise",
          sourceDistrictId: "harbormouth",
          destinationDistrictId: "cloverfield"
        },
        claimBonus: true
      }
    });
    view = await state(baseUrl, game, 1);
    expect(
      (view.publicState.publicGame as {
        parties: Record<string, unknown>;
      }).parties.honeycomb
    ).toMatchObject({
      operations: { organise: 1, rally: 0, smear: 0, court: 0 },
      claimedBonuses: ["organise"]
    });

    await gameAction(baseUrl, game, 0, "finish-operate", {
      type: "finish_operate"
    });

    await gameAction(baseUrl, game, 1, "collect", {
      type: "collect",
      partyId: "honeycomb"
    });
    view = await state(baseUrl, game, 1);
    expect(privateSeat(view)).toMatchObject({
      collectionCounters: 3,
      newYearCardCount: 1,
      newYearOperations: { organise: 1, rally: 0, smear: 0, court: 0 }
    });

    const malformed = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: game.sessions[0]!.accessToken,
      body: envelope(game, "malformed-operation", game.version, {
        type: "game_action",
        action: {
          type: "operate",
          partyId: "honeycomb",
          play: {
            operation: "rally",
            choice: { operation: "rally", districtId: "nowhere" }
          }
        }
      })
    });
    expect(malformed).toMatchObject({
      status: 409,
      body: { error: { code: "illegal_action" } }
    });

    const retiredGift = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: game.sessions[0]!.accessToken,
      body: envelope(game, "retired-gift", game.version, {
        type: "give_resources",
        recipientSeatId: game.sessions[1]!.seatId,
        points: 1
      })
    });
    expect(retiredGift).toMatchObject({
      status: 400,
      body: { error: { code: "invalid_request" } }
    });

    await gameAction(baseUrl, game, 0, "pass-a", { type: "pass" });
    await gameAction(baseUrl, game, 1, "pass-b", { type: "pass" });
    view = await state(baseUrl, game, 1);
    expect(view.publicState.publicGame).toMatchObject({
      year: 2,
      earlyBirdSeatId: game.sessions[1]!.seatId,
      phase: "opening"
    });
    expect(privateSeat(view)).toMatchObject({
      collectionCounters: 4,
      newYearCardCount: 0,
      operations: { organise: 5, rally: 8, smear: 4, court: 4 }
    });
    await app.close();
  });

  it("allows configured spectators to observe without granting player commands", async () => {
    const directory = temporaryDirectory();
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0,
      randomInteger: () => 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const game = await createGame(baseUrl, 2, true);
    const joined = await request(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: game.inviteCode,
        displayName: "Observer",
        controller: "human",
        role: "spectator"
      }
    });
    expect(joined.status).toBe(201);
    game.version += 1;
    const spectator = (joined.body as {
      session: { accessToken: string };
    }).session;
    await command(baseUrl, game, 0, "start", { type: "start_game" });

    const observed = await request(baseUrl, `/api/v1/games/${game.gameId}/state`, {
      token: spectator.accessToken
    });
    expect(observed).toMatchObject({
      status: 200,
      body: { scope: "public", publicState: { lifecycle: "active" } }
    });
    const forbidden = await request(baseUrl, commandPath(game), {
      method: "POST",
      token: spectator.accessToken,
      body: envelope(game, "spectator-pass", game.version, {
        type: "game_action",
        action: { type: "pass" }
      })
    });
    expect(forbidden).toMatchObject({
      status: 403,
      body: { error: { code: "forbidden" } }
    });
    await app.close();
  });

  it("admits new observers to completed replays without changing game history", async () => {
    const directory = temporaryDirectory();
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0,
      randomInteger: () => 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const game = await createGame(baseUrl, 2, true);
    await command(baseUrl, game, 0, "start", { type: "start_game" });
    app.store.database
      .prepare("UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?")
      .run("2026-08-13T00:00:00.000Z", game.gameId);
    const historyBeforeJoin = app.store.listEvents(game.gameId);

    const joined = await request(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: game.inviteCode,
        displayName: "Replay Reader",
        controller: "human",
        role: "spectator"
      }
    });
    expect(joined).toMatchObject({
      status: 201,
      body: {
        session: {
          participantType: "spectator",
          gameId: game.gameId
        },
        state: {
          scope: "completed_replay",
          publicState: {
            lifecycle: "completed",
            latestSequence: game.version
          }
        }
      }
    });
    expect(app.store.listEvents(game.gameId)).toEqual(historyBeforeJoin);

    const replayToken = (joined.body as {
      session: { accessToken: string };
    }).session.accessToken;
    const replay = await request(
      baseUrl,
      `/api/v1/games/${game.gameId}/replay`,
      { token: replayToken }
    );
    expect(replay).toMatchObject({
      status: 200,
      body: {
        gameId: game.gameId,
        latestSequence: game.version
      }
    });
    expect((replay.body as { events: unknown[] }).events).toHaveLength(
      historyBeforeJoin.length
    );
    await app.close();
  });

  it("keeps completed replays closed when observer admission is disabled", async () => {
    const directory = temporaryDirectory();
    const app = createAppServer({
      databasePath: resolve(directory, "game.sqlite"),
      port: 0,
      randomInteger: () => 0
    });
    const address = await app.listen();
    const baseUrl = `http://${address.host}:${address.port}`;
    const game = await createGame(baseUrl, 2);
    await command(baseUrl, game, 0, "start", { type: "start_game" });
    app.store.database
      .prepare("UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?")
      .run("2026-08-13T00:00:00.000Z", game.gameId);

    const joined = await request(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: game.inviteCode,
        displayName: "Replay Reader",
        controller: "human",
        role: "spectator"
      }
    });
    expect(joined).toMatchObject({
      status: 403,
      body: { error: { code: "forbidden" } }
    });
    await app.close();
  });
});

interface Session {
  seatId: string;
  accessToken: string;
}

interface TestGame {
  gameId: string;
  inviteCode: string;
  sessions: Session[];
  version: number;
}

interface TestView {
  scope: string;
  publicState: {
    lifecycle: string;
    latestSequence: number;
    configuration: { playerCount: number; allowSpectators: boolean };
    publicGame: Record<string, unknown>;
  };
  seatState?: { privateGame: { seat: Record<string, unknown> } };
}

async function createGame(
  baseUrl: string,
  playerCount: number,
  allowSpectators = false
): Promise<TestGame> {
  const created = await request(baseUrl, "/api/v1/games", {
    method: "POST",
    body: {
      displayName: "Player 1",
      controller: "human",
      configuration: { allowSpectators }
    }
  });
  expect(created.status).toBe(201);
  const host = created.body as {
    inviteCode: string;
    session: { gameId: string; seatId: string; accessToken: string };
  };
  const sessions: Session[] = [host.session];
  for (let index = 1; index < playerCount; index += 1) {
    const joined = await request(baseUrl, "/api/v1/games/join", {
      method: "POST",
      body: {
        inviteCode: host.inviteCode,
        displayName: `Player ${index + 1}`,
        controller: "human",
        role: "player"
      }
    });
    expect(joined.status).toBe(201);
    sessions.push((joined.body as { session: Session }).session);
  }
  return {
    gameId: host.session.gameId,
    inviteCode: host.inviteCode,
    sessions,
    version: playerCount
  };
}

async function command(
  baseUrl: string,
  game: TestGame,
  seatIndex: number,
  idempotencyKey: string,
  commandBody: unknown
): Promise<void> {
  const response = await request(baseUrl, commandPath(game), {
    method: "POST",
    token: game.sessions[seatIndex]!.accessToken,
    body: envelope(game, idempotencyKey, game.version, commandBody)
  });
  expect(response.status).toBe(200);
  game.version += 1;
}

async function gameAction(
  baseUrl: string,
  game: TestGame,
  seatIndex: number,
  idempotencyKey: string,
  action: unknown
): Promise<void> {
  await command(baseUrl, game, seatIndex, idempotencyKey, {
    type: "game_action",
    action
  });
}

function envelope(
  game: TestGame,
  idempotencyKey: string,
  expectedVersion: number,
  command: unknown
) {
  return {
    gameId: game.gameId,
    idempotencyKey,
    expectedVersion,
    command
  };
}

async function state(
  baseUrl: string,
  game: TestGame,
  seatIndex: number
): Promise<TestView> {
  const response = await request(baseUrl, `/api/v1/games/${game.gameId}/state`, {
    token: game.sessions[seatIndex]!.accessToken
  });
  expect(response.status).toBe(200);
  return response.body as TestView;
}

function privateSeat(view: TestView): Record<string, unknown> {
  const seat = view.seatState?.privateGame.seat;
  if (seat === undefined) {
    throw new Error("Expected a private seat projection");
  }
  return seat;
}

function commandPath(game: TestGame): string {
  return `/api/v1/games/${game.gameId}/commands`;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "bellweather-server-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function request(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
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
