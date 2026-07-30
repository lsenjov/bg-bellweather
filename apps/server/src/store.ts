import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  tokenLookup,
  verifySeatToken,
  type TokenDigest
} from "./auth.js";
import { AppError, assertFound } from "./errors.js";
import type {
  AuthenticatedSeat,
  AuthenticatedParticipant,
  Controller,
  EventDraft,
  GameRecord,
  GameSettings,
  SeatRecord,
  SpectatorRecord,
  StoredEvent
} from "./types.js";

interface GameRow {
  id: string;
  code: string;
  status: string;
  ruleset_version: string;
  settings_json: string;
  host_seat_id: string;
  current_version: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface SeatRow {
  id: string;
  game_id: string;
  position: number;
  display_name: string;
  controller: string;
  ready: number;
  joined_at: string;
}

interface AuthSeatRow extends SeatRow {
  token_salt: Uint8Array;
  token_hash: Uint8Array;
}

interface EventRow {
  game_id: string;
  version: number;
  id: string;
  type: string;
  payload_json: string;
  actor_seat_id: string | null;
  visibility: string;
  private_seat_id: string | null;
  occurred_at: string;
  schema_version: number;
}

interface SpectatorRow {
  id: string;
  game_id: string;
  display_name: string;
  controller: string;
  joined_at: string;
}

interface AuthSpectatorRow extends SpectatorRow {
  token_salt: Uint8Array;
  token_hash: Uint8Array;
}

export interface CreateLobbyInput {
  id: string;
  code: string;
  settings: GameSettings;
  rulesetVersion: string;
  seat: {
    id: string;
    displayName: string;
    controller: Controller;
    token: TokenDigest;
  };
  now: string;
}

export interface JoinLobbyInput {
  gameReference: string;
  seat: {
    id: string;
    displayName: string;
    controller: Controller;
    token: TokenDigest;
  };
  now: string;
}

export interface JoinSpectatorInput {
  gameReference: string;
  spectator: {
    id: string;
    displayName: string;
    controller: Controller;
    token: TokenDigest;
  };
  now: string;
}

export interface LobbyMutation {
  game: GameRecord;
  seat: SeatRecord;
  event: StoredEvent;
}

export interface ProcessCommandInput {
  idempotencyKey: string;
  requestHash: string;
  expectedVersion: number | undefined;
  type: string;
  payload: unknown;
}

export interface ProcessedCommand {
  accepted: {
    gameId: string;
    idempotencyKey: string;
    version: number;
    latestSequence: number;
  };
  event: StoredEvent | null;
  replayed: boolean;
}

export class EventStore {
  readonly database: DatabaseSync;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = FULL");
    this.runMigrations();
  }

  close(): void {
    this.database.close();
  }

  createLobby(input: CreateLobbyInput): LobbyMutation {
    return this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO games (
             id, code, status, ruleset_version, settings_json, current_version, created_at
           ) VALUES (?, ?, 'lobby', ?, ?, 0, ?)`
        )
        .run(
          input.id,
          input.code,
          input.rulesetVersion,
          JSON.stringify(input.settings),
          input.now
        );

      this.insertSeat(input.id, 0, input.seat, input.now);
      this.database
        .prepare("UPDATE games SET host_seat_id = ? WHERE id = ?")
        .run(input.seat.id, input.id);

      const event = this.appendEventUnsafe(input.id, input.now, {
        type: "lobby.created",
        actorSeatId: input.seat.id,
        payload: {
          settings: input.settings,
          hostSeatId: input.seat.id,
          seat: publicSeat(this.getSeatById(input.seat.id))
        }
      });

      return {
        game: this.getGameById(input.id),
        seat: this.getSeatById(input.seat.id),
        event
      };
    });
  }

  joinLobby(input: JoinLobbyInput): LobbyMutation {
    return this.transaction(() => {
      const game = this.resolveGame(input.gameReference);
      if (game.status !== "lobby") {
        throw new AppError(409, "game_already_started", "Players cannot join after the game starts");
      }

      const seats = this.listSeats(game.id);
      if (seats.length >= game.settings.seatCount) {
        throw new AppError(409, "lobby_full", "The lobby has no open seats");
      }

      const position = seats.length;
      this.insertSeat(game.id, position, input.seat, input.now);
      const seat = this.getSeatById(input.seat.id);
      const event = this.appendEventUnsafe(game.id, input.now, {
        type: "lobby.seat_joined",
        actorSeatId: input.seat.id,
        payload: { seat: publicSeat(seat) }
      });

      return { game: this.getGameById(game.id), seat, event };
    });
  }

  joinSpectator(input: JoinSpectatorInput): {
    game: GameRecord;
    spectator: SpectatorRecord;
    event: StoredEvent;
  } {
    return this.transaction(() => {
      const game = this.resolveGame(input.gameReference);
      if (game.status !== "lobby") {
        throw new AppError(409, "phase_closed", "Spectators cannot join after play begins");
      }
      if (!game.settings.allowSpectators) {
        throw new AppError(403, "forbidden", "This game does not allow spectators");
      }
      this.database
        .prepare(
          `INSERT INTO spectators (
             id, game_id, display_name, controller,
             token_lookup, token_salt, token_hash, joined_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.spectator.id,
          game.id,
          input.spectator.displayName,
          input.spectator.controller,
          input.spectator.token.lookup,
          input.spectator.token.salt,
          input.spectator.token.hash,
          input.now
        );
      const spectator = this.getSpectatorById(input.spectator.id);
      const event = this.appendEventUnsafe(game.id, input.now, {
        type: "lobby.spectator_joined",
        payload: {
          spectator: {
            spectatorId: spectator.id,
            displayName: spectator.displayName,
            controller: spectator.controller
          }
        }
      });
      return { game: this.getGameById(game.id), spectator, event };
    });
  }

  processCommand(
    gameId: string,
    seatId: string,
    command: ProcessCommandInput,
    now: string
  ): ProcessedCommand {
    return this.transaction(() => {
      const prior = this.database
        .prepare(
          `SELECT request_hash, response_json
             FROM processed_commands
            WHERE game_id = ? AND seat_id = ? AND command_id = ?`
        )
        .get(gameId, seatId, command.idempotencyKey) as
        | { request_hash: string; response_json: string }
        | undefined;

      if (prior !== undefined) {
        if (prior.request_hash !== command.requestHash) {
          throw new AppError(
            409,
            "idempotency_conflict",
            "Idempotency key was already used for a different command"
          );
        }
        return {
          accepted: JSON.parse(prior.response_json) as ProcessedCommand["accepted"],
          event: null,
          replayed: true
        };
      }

      const game = this.getGameById(gameId);
      if (
        command.expectedVersion !== undefined &&
        game.currentVersion !== command.expectedVersion
      ) {
        throw new AppError(409, "version_conflict", "The game has changed", {
          expectedVersion: command.expectedVersion,
          currentVersion: game.currentVersion
        });
      }

      let event: StoredEvent;
      if (command.type === "start_game") {
        if (game.hostSeatId !== seatId) {
          throw new AppError(403, "forbidden", "Only the host can start the game");
        }
        if (game.status !== "lobby") {
          throw new AppError(409, "phase_closed", "The game has already started");
        }
        if (this.listSeats(game.id).length !== game.settings.seatCount) {
          throw new AppError(409, "illegal_action", "Every seat must be filled");
        }
        this.database
          .prepare("UPDATE games SET status = 'active', started_at = ? WHERE id = ?")
          .run(now, game.id);
        event = this.appendEventUnsafe(game.id, now, {
          type: "game.started",
          actorSeatId: seatId,
          payload: { startedAt: now }
        });
      } else if (command.type === "set_lobby_ready") {
        if (game.status !== "lobby") {
          throw new AppError(409, "phase_closed", "Lobby readiness is closed");
        }
        const ready =
          typeof command.payload === "object" &&
          command.payload !== null &&
          "ready" in command.payload &&
          command.payload.ready === true;
        this.database
          .prepare("UPDATE seats SET ready = ? WHERE id = ? AND game_id = ?")
          .run(ready ? 1 : 0, seatId, gameId);
        event = this.appendEventUnsafe(gameId, now, {
          type: "lobby.ready_changed",
          actorSeatId: seatId,
          payload: { seatId, ready }
        });
      } else {
        if (game.status !== "active") {
          throw new AppError(409, "phase_closed", "Game commands require active play");
        }
        event = this.appendEventUnsafe(gameId, now, {
          type: command.type === "post_chat" ? "chat.posted" : "command.recorded",
          actorSeatId: seatId,
          ...(command.type === "post_chat"
            ? {}
            : {
                visibility: "seat" as const,
                privateSeatId: seatId
              }),
          payload: command.payload
        });
      }

      const accepted: ProcessedCommand["accepted"] = {
        gameId,
        idempotencyKey: command.idempotencyKey,
        version: event.version,
        latestSequence: event.version
      };

      this.database
        .prepare(
          `INSERT INTO processed_commands (
             game_id, seat_id, command_id, request_hash, response_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          gameId,
          seatId,
          command.idempotencyKey,
          command.requestHash,
          JSON.stringify(accepted),
          now
        );
      return { accepted, event, replayed: false };
    });
  }

  authenticate(gameReference: string, token: string): AuthenticatedSeat {
    const participant = this.authenticateParticipant(gameReference, token);
    if (!("seat" in participant)) {
      throw new AppError(403, "forbidden", "A player seat is required");
    }
    return participant;
  }

  authenticateParticipant(
    gameReference: string,
    token: string
  ): AuthenticatedParticipant {
    const row = this.database
      .prepare(
        `SELECT id, game_id, position, display_name, controller, ready, joined_at,
                token_salt, token_hash
           FROM seats
          WHERE token_lookup = ?`
      )
      .get(tokenLookup(token)) as AuthSeatRow | undefined;

    const game = this.resolveGame(gameReference);
    if (
      row !== undefined &&
      verifySeatToken(token, row.token_salt, row.token_hash)
    ) {
      if (row.game_id !== game.id) {
        throw new AppError(403, "wrong_game", "The token belongs to another game");
      }
      return { game, seat: mapSeat(row) };
    }

    const spectatorRow = this.database
      .prepare(
        `SELECT id, game_id, display_name, controller, joined_at,
                token_salt, token_hash
           FROM spectators
          WHERE token_lookup = ?`
      )
      .get(tokenLookup(token)) as AuthSpectatorRow | undefined;
    if (
      spectatorRow === undefined ||
      !verifySeatToken(
        token,
        spectatorRow.token_salt,
        spectatorRow.token_hash
      )
    ) {
      throw new AppError(401, "invalid_token", "The participant token is invalid");
    }
    if (spectatorRow.game_id !== game.id) {
      throw new AppError(403, "wrong_game", "The token belongs to another game");
    }
    return { game, spectator: mapSpectator(spectatorRow) };
  }

  resolveGame(reference: string): GameRecord {
    const row = this.database
      .prepare("SELECT * FROM games WHERE id = ? OR code = ? COLLATE NOCASE")
      .get(reference, reference) as GameRow | undefined;
    return mapGame(assertFound(row, "game_not_found", "Game not found"));
  }

  getGameById(id: string): GameRecord {
    const row = this.database.prepare("SELECT * FROM games WHERE id = ?").get(id) as
      | GameRow
      | undefined;
    return mapGame(assertFound(row, "game_not_found", "Game not found"));
  }

  getSeatById(id: string): SeatRecord {
    const row = this.database
      .prepare(
        `SELECT id, game_id, position, display_name, controller, ready, joined_at
           FROM seats
          WHERE id = ?`
      )
      .get(id) as SeatRow | undefined;
    return mapSeat(assertFound(row, "seat_not_found", "Seat not found"));
  }

  listSeats(gameId: string): SeatRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, game_id, position, display_name, controller, ready, joined_at
           FROM seats
          WHERE game_id = ?
          ORDER BY position`
      )
      .all(gameId) as unknown as SeatRow[];
    return rows.map(mapSeat);
  }

  getSpectatorById(id: string): SpectatorRecord {
    const row = this.database
      .prepare(
        `SELECT id, game_id, display_name, controller, joined_at
           FROM spectators
          WHERE id = ?`
      )
      .get(id) as SpectatorRow | undefined;
    return mapSpectator(
      assertFound(row, "spectator_not_found", "Spectator not found")
    );
  }

  listSpectators(gameId: string): SpectatorRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, game_id, display_name, controller, joined_at
           FROM spectators
          WHERE game_id = ?
          ORDER BY joined_at, id`
      )
      .all(gameId) as unknown as SpectatorRow[];
    return rows.map(mapSpectator);
  }

  listEvents(gameId: string, afterVersion = 0): StoredEvent[] {
    const rows = this.database
      .prepare(
        `SELECT *
           FROM events
          WHERE game_id = ? AND version > ?
          ORDER BY version`
      )
      .all(gameId, afterVersion) as unknown as EventRow[];
    return rows.map(mapEvent);
  }

  saveSnapshot(
    gameId: string,
    version: number,
    rulesetVersion: string,
    state: unknown,
    now: string
  ): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO snapshots (
           game_id, version, ruleset_version, state_json, created_at
         ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(gameId, version, rulesetVersion, JSON.stringify(state), now);
  }

  loadLatestSnapshot(gameId: string): {
    version: number;
    rulesetVersion: string;
    state: unknown;
  } | null {
    const row = this.database
      .prepare(
        `SELECT version, ruleset_version, state_json
           FROM snapshots
          WHERE game_id = ?
          ORDER BY version DESC
          LIMIT 1`
      )
      .get(gameId) as
      | { version: number; ruleset_version: string; state_json: string }
      | undefined;

    return row === undefined
      ? null
      : {
          version: row.version,
          rulesetVersion: row.ruleset_version,
          state: JSON.parse(row.state_json) as unknown
        };
  }

  private insertSeat(
    gameId: string,
    position: number,
    seat: CreateLobbyInput["seat"],
    now: string
  ): void {
    this.database
      .prepare(
        `INSERT INTO seats (
           id, game_id, position, display_name, controller, ready,
           token_lookup, token_salt, token_hash, joined_at
         ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        seat.id,
        gameId,
        position,
        seat.displayName,
        seat.controller,
        seat.token.lookup,
        seat.token.salt,
        seat.token.hash,
        now
      );
  }

  private appendEventUnsafe(
    gameId: string,
    now: string,
    draft: EventDraft
  ): StoredEvent {
    const visibility = draft.visibility ?? "public";
    const privateSeatId = draft.privateSeatId ?? null;
    if (
      (visibility === "public" && privateSeatId !== null) ||
      (visibility === "seat" && privateSeatId === null)
    ) {
      throw new Error("Event visibility and private seat must agree");
    }
    const game = this.getGameById(gameId);
    const event: StoredEvent = {
      gameId,
      version: game.currentVersion + 1,
      id: randomUUID(),
      type: draft.type,
      payload: draft.payload,
      actorSeatId: draft.actorSeatId ?? null,
      visibility,
      privateSeatId,
      occurredAt: now,
      schemaVersion: 1
    };

    this.database
      .prepare(
        `INSERT INTO events (
           game_id, version, id, type, payload_json, actor_seat_id,
           visibility, private_seat_id, occurred_at, schema_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.gameId,
        event.version,
        event.id,
        event.type,
        JSON.stringify(event.payload),
        event.actorSeatId,
        event.visibility,
        event.privateSeatId,
        event.occurredAt,
        event.schemaVersion
      );

    const result = this.database
      .prepare(
        `UPDATE games
            SET current_version = ?
          WHERE id = ? AND current_version = ?`
      )
      .run(event.version, gameId, game.currentVersion);
    if (result.changes !== 1) {
      throw new AppError(409, "version_conflict", "The game changed while appending an event");
    }
    return event;
  }

  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private runMigrations(): void {
    this.database.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TEXT NOT NULL
       ) STRICT`
    );

    const migrationsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations"
    );
    const migrations = readdirSync(migrationsPath)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const name of migrations) {
      const applied = this.database
        .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
        .get(name);
      if (applied !== undefined) {
        continue;
      }

      this.transaction(() => {
        this.database.exec(readFileSync(resolve(migrationsPath, name), "utf8"));
        this.database
          .prepare(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)"
          )
          .run(name, new Date().toISOString());
      });
    }
  }
}

function mapGame(row: GameRow): GameRecord {
  if (row.status !== "lobby" && row.status !== "active" && row.status !== "finished") {
    throw new Error(`Unsupported game status: ${row.status}`);
  }

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    rulesetVersion: row.ruleset_version,
    settings: JSON.parse(row.settings_json) as GameSettings,
    hostSeatId: row.host_seat_id,
    currentVersion: row.current_version,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  };
}

function mapSeat(row: SeatRow): SeatRecord {
  if (row.controller !== "human" && row.controller !== "agent") {
    throw new Error(`Unsupported seat controller: ${row.controller}`);
  }

  return {
    id: row.id,
    gameId: row.game_id,
    position: row.position,
    displayName: row.display_name,
    controller: row.controller,
    ready: row.ready === 1,
    joinedAt: row.joined_at
  };
}

function mapEvent(row: EventRow): StoredEvent {
  if (row.visibility !== "public" && row.visibility !== "seat") {
    throw new Error(`Unsupported event visibility: ${row.visibility}`);
  }

  return {
    gameId: row.game_id,
    version: row.version,
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload_json) as unknown,
    actorSeatId: row.actor_seat_id,
    visibility: row.visibility,
    privateSeatId: row.private_seat_id,
    occurredAt: row.occurred_at,
    schemaVersion: row.schema_version
  };
}

function mapSpectator(row: SpectatorRow): SpectatorRecord {
  if (row.controller !== "human" && row.controller !== "agent") {
    throw new Error(`Unsupported spectator controller: ${row.controller}`);
  }
  return {
    id: row.id,
    gameId: row.game_id,
    displayName: row.display_name,
    controller: row.controller,
    joinedAt: row.joined_at
  };
}

function publicSeat(seat: SeatRecord): Omit<SeatRecord, "gameId"> {
  const { gameId: _, ...visible } = seat;
  return visible;
}
