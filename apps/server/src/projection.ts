import {
  ProjectedEventEnvelopeSchema,
  ViewerStateEnvelopeSchema,
  type ProjectedEventEnvelope,
  type ViewerStateEnvelope
} from "@bellweather/protocol";
import {
  projectGameState,
  type GameAction,
  type GameEvent,
  type GameState
} from "@bellweather/game";
import type { EventStore } from "./store.js";
import type { GameRecord, StoredEvent } from "./types.js";

export function projectState(
  store: EventStore,
  game: GameRecord,
  viewerSeatId?: string
): ViewerStateEnvelope {
  const lifecycle = game.status === "finished" ? "completed" : game.status;
  const engineState = store.loadEngineState(game.id);
  const seats = store.listSeats(game.id);
  const publicState = {
    gameId: game.id,
    inviteCode: game.code,
    version: game.currentVersion,
    latestSequence: game.currentVersion,
    lifecycle,
    configuration: {
      playerCount: engineState?.seats.length ?? seats.length,
      allowSpectators: game.settings.allowSpectators
    },
    seats: seats.map((seat) => ({
      seatId: seat.id,
      seatIndex: seat.position,
      displayName: seat.displayName,
      role: seat.id === game.hostSeatId ? ("host" as const) : ("player" as const),
      controller: seat.controller,
      ready: seat.ready
    })),
    spectators: store.listSpectators(game.id).map((spectator) => ({
      spectatorId: spectator.id,
      displayName: spectator.displayName,
      controller: spectator.controller
    })),
    publicGame:
      engineState === null
        ? { phase: game.status, rulesetVersion: game.rulesetVersion }
        : publicEngineState(engineState)
  };

  if (game.status === "finished") {
    return ViewerStateEnvelopeSchema.parse({
      scope: "completed_replay",
      publicState,
      fullState: {
        fullGame: {
          state: engineState,
          events: store.listEvents(game.id).map(canonicalEvent)
        }
      }
    });
  }

  if (viewerSeatId === undefined) {
    return ViewerStateEnvelopeSchema.parse({ scope: "public", publicState });
  }

  return ViewerStateEnvelopeSchema.parse({
    scope: "seat",
    viewerSeatId,
    publicState,
    seatState: {
      seatId: viewerSeatId,
      privateGame:
        engineState === null ? null : seatEngineState(engineState, viewerSeatId)
    }
  });
}

export function projectEvent(
  event: StoredEvent,
  viewerSeatId: string | undefined,
  completed: boolean
): ProjectedEventEnvelope {
  const base = {
    eventId: event.id,
    gameId: event.gameId,
    sequence: event.version,
    version: event.version,
    occurredAt: event.occurredAt,
    eventType: event.type
  };

  if (completed) {
    return ProjectedEventEnvelopeSchema.parse({
      ...base,
      scope: "completed_replay",
      fullData: { event: canonicalEvent(event) }
    });
  }

  if (isEngineEventPayload(event.payload)) {
    return ProjectedEventEnvelopeSchema.parse({
      ...base,
      scope: "public",
      publicData: publicEngineEvent(event.payload)
    });
  }

  if (event.visibility === "seat") {
    if (viewerSeatId !== undefined && event.privateSeatId === viewerSeatId) {
      return ProjectedEventEnvelopeSchema.parse({
        ...base,
        scope: "seat",
        viewerSeatId,
        publicData: {},
        seatData: objectPayload(event.payload)
      });
    }
    return ProjectedEventEnvelopeSchema.parse({
      ...base,
      eventType: "private_event",
      scope: "public",
      publicData: {}
    });
  }

  return ProjectedEventEnvelopeSchema.parse({
    ...base,
    scope: "public",
    publicData: objectPayload(event.payload)
  });
}

export function publicEngineState(state: GameState): Record<string, unknown> {
  return projectGameState(state, null) as unknown as Record<string, unknown>;
}

export function seatEngineState(
  state: GameState,
  viewerSeatId: string
): Record<string, unknown> {
  const view = projectGameState(state, viewerSeatId);
  return {
    seat: view.seats.find((seat) => seat.id === viewerSeatId) ?? null
  };
}

function isEngineEventPayload(
  payload: unknown
): payload is {
  engineEvents: GameEvent[];
  electionResults?: Array<Record<string, unknown>>;
} {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "engineEvents" in payload &&
    Array.isArray(payload.engineEvents)
  );
}

function publicEngineEvent(payload: {
  engineEvents: GameEvent[];
  electionResults?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const actions = payload.engineEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "action_applied" }> =>
        event.type === "action_applied"
    )
    .map((event) => publicAction(event.action));
  const initialized = payload.engineEvents.find(
    (event) => event.type === "game_initialized"
  );
  return {
    ...(initialized === undefined
      ? {}
      : { gameStarted: true, year: initialized.state.year }),
    actions,
    ...(payload.electionResults === undefined
      ? {}
      : { electionResults: payload.electionResults })
  };
}

function publicAction(action: GameAction): Record<string, unknown> {
  if (action.type === "complete_election") {
    return { type: action.type };
  }
  if (action.type === "post_chat") {
    return {
      type: action.type,
      seatId: action.seatId,
      text: action.text,
      now: action.now
    };
  }
  if (action.type === "operate") {
    return {
      type: action.type,
      seatId: action.seatId,
      partyId: action.partyId,
      operation: action.play.operation,
      claimBonus: action.play.claimBonus === true
    };
  }
  return { ...action };
}

function canonicalEvent(event: StoredEvent): Record<string, unknown> {
  return {
    id: event.id,
    gameId: event.gameId,
    sequence: event.version,
    type: event.type,
    payload: event.payload,
    actorSeatId: event.actorSeatId,
    visibility: event.visibility,
    privateSeatId: event.privateSeatId,
    occurredAt: event.occurredAt,
    schemaVersion: event.schemaVersion
  };
}

function objectPayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}
