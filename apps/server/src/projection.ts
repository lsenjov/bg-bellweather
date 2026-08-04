import {
  ProjectedEventEnvelopeSchema,
  ViewerStateEnvelopeSchema,
  type ProjectedEventEnvelope,
  type ViewerStateEnvelope
} from "@bellweather/protocol";
import {
  bidCardCount,
  type BidState,
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
  const lifecycle =
    game.status === "finished" ? "completed" : game.status;
  const engineState = store.loadEngineState(game.id);
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
    publicGame:
      engineState === null
        ? {
            phase: game.status,
            rulesetVersion: game.rulesetVersion
          }
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
      fullData: {
        event: canonicalEvent(event)
      }
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

function publicEngineState(state: GameState): Record<string, unknown> {
  const revealBids =
    state.phase.type === "resolution" ||
    state.phase.type === "election" ||
    state.phase.type === "complete";
  return {
    rulesetVersion: state.rulesetVersion,
    round: state.round,
    electionNumber: state.electionNumber,
    nextFirstOpenerSeatId: state.nextFirstOpenerSeatId,
    partyOrder: state.partyOrder,
    support: state.support,
    courtSupport: state.courtSupport,
    coalitionTargets: state.coalitionTargets,
    phase: publicPhase(state),
    seats: state.seats.map((seat) => ({
      id: seat.id,
      position: seat.position,
      displayName: seat.displayName,
      controller: seat.controller,
      firmIds: seat.firmIds,
      points: seat.reserve.points
    })),
    contests: Object.fromEntries(
      Object.entries(state.contests).map(([contestId, contest]) => [
        contestId,
        contest === undefined
          ? null
          : {
              id: contest.id,
              targetPartyId: contest.targetPartyId,
              openingBidId: contest.openingBidId,
              bids: contest.bidIds.map((bidId) =>
                publicBid(state.bids[bidId]!, revealBids)
              )
            }
      ])
    ),
    resolvedOperations: state.resolvedOperations,
    chat: state.chat,
    roundHistory: state.roundHistory,
    electionHistory: state.electionHistory,
    lastElection: state.electionHistory.at(-1) ?? null
  };
}

function publicPhase(state: GameState): Record<string, unknown> {
  const phase = state.phase;
  if (phase.type === "opening") {
    return {
      type: phase.type,
      activeSeatId: phase.activeSeatId,
      submittedSeatIds: phase.submittedSeatIds
    };
  }
  if (phase.type === "counterbidding") {
    return {
      type: phase.type,
      deadlineAt: phase.deadlineAt,
      readySeatIds: phase.readySeatIds
    };
  }
  if (phase.type === "resolution") {
    return {
      type: phase.type,
      contestOrder: phase.contestOrder,
      contestIndex: phase.contestIndex,
      pendingDecision:
        phase.pendingDecision === null
          ? null
          : {
              id: phase.pendingDecision.id,
              kind: phase.pendingDecision.kind,
              seatId: phase.pendingDecision.seatId,
              contestId: phase.pendingDecision.contestId,
              bidId: phase.pendingDecision.bidId,
              ...("legalOperations" in phase.pendingDecision
                ? { legalOperations: phase.pendingDecision.legalOperations }
                : {}),
              ...("adjacentIndexes" in phase.pendingDecision
                ? { adjacentIndexes: phase.pendingDecision.adjacentIndexes }
                : {}),
              ...("operation" in phase.pendingDecision
                ? { operation: phase.pendingDecision.operation }
                : {})
            }
    };
  }
  return phase as unknown as Record<string, unknown>;
}

function publicBid(bid: BidState, reveal: boolean): Record<string, unknown> {
  const base = {
    id: bid.id,
    contestId: bid.contestId,
    ownerSeatId: bid.ownerSeatId,
    firmId: bid.firmId,
    kind: bid.kind,
    slotIndex: bid.slotIndex,
    status: bid.status,
    cardCount: bidCardCount(bid),
    transferredToSeatId: bid.transferredToSeatId
  };
  if (reveal) {
    return {
      ...base,
      leverage: bid.leverage,
      bluff: bid.bluff,
      operations: bid.operations
    };
  }
  if (bid.kind === "opening") {
    return {
      ...base,
      leverage: bid.leverage
    };
  }
  return base;
}

function seatEngineState(
  state: GameState,
  viewerSeatId: string
): Record<string, unknown> {
  const seat = state.seats.find((candidate) => candidate.id === viewerSeatId);
  if (seat === undefined) {
    return {};
  }
  const ownBids = Object.values(state.bids).filter(
    (bid) => bid.ownerSeatId === viewerSeatId
  );
  return {
    reserve: seat.reserve,
    scoringCardId: seat.scoringCardId,
    ownBids,
    counterbidSlots: state.counterbidSlots[viewerSeatId] ?? [],
    pendingDecision:
      state.phase.type === "resolution" &&
      state.phase.pendingDecision?.seatId === viewerSeatId
        ? state.phase.pendingDecision
        : null
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
      : { gameStarted: true, round: initialized.state.round }),
    actions,
    ...(payload.electionResults === undefined
      ? {}
      : { electionResults: payload.electionResults })
  };
}

function publicAction(action: GameAction): Record<string, unknown> {
  if (action.type === "post_chat") {
    return {
      type: action.type,
      seatId: action.seatId,
      text: action.text,
      now: action.now
    };
  }
  if (action.type === "give_resources") {
    return {
      type: action.type,
      fromSeatId: action.seatId,
      recipientSeatId: action.recipientSeatId
    };
  }
  if (action.type === "complete_election") {
    return { type: action.type };
  }
  if (action.type === "expire_counterbids") {
    return { type: action.type, now: action.now };
  }
  return { type: action.type, seatId: action.seatId };
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
