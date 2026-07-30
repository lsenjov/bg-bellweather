export type GameStatus = "lobby" | "active" | "finished";
export type Controller = "human" | "agent";

export interface GameSettings {
  seatCount: number;
  counterbidTimerSeconds: number | null;
  allowSpectators: boolean;
}

export interface GameRecord {
  id: string;
  code: string;
  status: GameStatus;
  rulesetVersion: string;
  settings: GameSettings;
  hostSeatId: string;
  currentVersion: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SeatRecord {
  id: string;
  gameId: string;
  position: number;
  displayName: string;
  controller: Controller;
  ready: boolean;
  joinedAt: string;
}

export interface SpectatorRecord {
  id: string;
  gameId: string;
  displayName: string;
  controller: Controller;
  joinedAt: string;
}

export interface StoredEvent {
  gameId: string;
  version: number;
  id: string;
  type: string;
  payload: unknown;
  actorSeatId: string | null;
  visibility: "public" | "seat";
  privateSeatId: string | null;
  occurredAt: string;
  schemaVersion: number;
}

export interface EventDraft {
  type: string;
  payload: unknown;
  actorSeatId?: string;
  visibility?: "public" | "seat";
  privateSeatId?: string;
}

export interface AuthenticatedSeat {
  game: GameRecord;
  seat: SeatRecord;
}

export type AuthenticatedParticipant =
  | AuthenticatedSeat
  | {
      game: GameRecord;
      spectator: SpectatorRecord;
    };

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
