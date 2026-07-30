import {
  ProjectedEventEnvelopeSchema,
  ViewerStateEnvelopeSchema,
  type ProjectedEventEnvelope,
  type ViewerStateEnvelope
} from "@bellwether/protocol";
import type { EventStore } from "./store.js";
import type { GameRecord, StoredEvent } from "./types.js";

export function projectState(
  store: EventStore,
  game: GameRecord,
  viewerSeatId?: string
): ViewerStateEnvelope {
  const lifecycle =
    game.status === "finished" ? "completed" : game.status;
  const publicState = {
    gameId: game.id,
    version: game.currentVersion,
    latestSequence: game.currentVersion,
    lifecycle,
    configuration: {
      playerCount: game.settings.seatCount,
      counterbidTimer:
        game.settings.counterbidTimerSeconds === null
          ? { mode: "off" as const }
          : {
              mode: "countdown" as const,
              durationSeconds: game.settings.counterbidTimerSeconds
            },
      allowSpectators: game.settings.allowSpectators
    },
    seats: store.listSeats(game.id).map((seat) => ({
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
    publicGame: {
      phase: game.status,
      rulesetVersion: game.rulesetVersion
    }
  };

  if (game.status === "finished") {
    return ViewerStateEnvelopeSchema.parse({
      scope: "completed_replay",
      publicState,
      fullState: {
        fullGame: {
          events: store.listEvents(game.id).map(canonicalEvent)
        }
      }
    });
  }

  if (viewerSeatId === undefined) {
    return ViewerStateEnvelopeSchema.parse({
      scope: "public",
      publicState
    });
  }

  return ViewerStateEnvelopeSchema.parse({
    scope: "seat",
    viewerSeatId,
    publicState,
    seatState: {
      seatId: viewerSeatId,
      privateGame: null
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
      fullData: {
        event: canonicalEvent(event)
      }
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
