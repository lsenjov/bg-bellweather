import type {
  GameState,
  OperationInventory,
  ScoringCardSlots,
  SeatId
} from "./model.js";
import { assertCurrentRuleset, operationCount } from "./engine.js";
import { GameRuleError } from "./model.js";

export interface ProjectedSeat {
  id: SeatId;
  displayName: string;
  controller: "human" | "agent";
  position: number;
  firmIds: readonly string[];
  points: number;
  collectionCounters: number;
  collectionCounterLimit: number;
  handCount: number;
  newYearCardCount: number;
  operations: OperationInventory | null;
  newYearOperations: OperationInventory | null;
  scoringCardIds: ScoringCardSlots | null;
}

export interface GameView {
  rulesetVersion: string;
  year: number;
  electionNumber: number;
  phase: GameState["phase"]["type"];
  phaseData: GameState["phase"];
  earlyBirdSeatId: SeatId;
  seats: ProjectedSeat[];
  parties: GameState["parties"];
  support: GameState["support"];
  courtSupport: GameState["courtSupport"];
  coalitionTargets: GameState["coalitionTargets"];
  lobbyActions: GameState["lobbyActions"];
  resolvedOperations: GameState["resolvedOperations"];
  chat: GameState["chat"];
  yearHistory: GameState["yearHistory"];
  electionHistory: GameState["electionHistory"];
}

export function projectGameState(
  state: GameState,
  viewerSeatId: SeatId | null,
  fullInformation = false
): GameView {
  assertCurrentRuleset(state);
  if (fullInformation && state.phase.type !== "complete") {
    throw new GameRuleError(
      "full_replay_unavailable",
      "Full information is available only after the game completes"
    );
  }
  if (
    viewerSeatId !== null &&
    !state.seats.some((seat) => seat.id === viewerSeatId)
  ) {
    throw new GameRuleError("unknown_seat", "The player seat does not exist");
  }

  return {
    rulesetVersion: state.rulesetVersion,
    year: state.year,
    electionNumber: state.electionNumber,
    phase: state.phase.type,
    phaseData: structuredClone(state.phase),
    earlyBirdSeatId: state.earlyBirdSeatId,
    seats: state.seats.map((seat) => {
      const privateInformation = viewerSeatId === seat.id || fullInformation;
      return {
        id: seat.id,
        displayName: seat.displayName,
        controller: seat.controller,
        position: seat.position,
        firmIds: [...seat.firmIds],
        points: seat.points,
        collectionCounters: seat.collectionCounters,
        collectionCounterLimit: seat.collectionCounterLimit,
        handCount: operationCount(seat.operations),
        newYearCardCount: operationCount(seat.newYearOperations),
        operations: privateInformation ? { ...seat.operations } : null,
        newYearOperations: privateInformation
          ? { ...seat.newYearOperations }
          : null,
        scoringCardIds: privateInformation || state.phase.type === "complete"
          ? cloneScoringCardSlots(seat.scoringCardIds)
          : visibleScoringCardSlots(state, seat.scoringCardIds)
      };
    }),
    parties: structuredClone(state.parties),
    support: structuredClone(state.support),
    courtSupport: structuredClone(state.courtSupport),
    coalitionTargets: { ...state.coalitionTargets },
    lobbyActions: structuredClone(state.lobbyActions),
    resolvedOperations: structuredClone(state.resolvedOperations),
    chat: structuredClone(state.chat),
    yearHistory: structuredClone(state.yearHistory),
    electionHistory: structuredClone(state.electionHistory)
  };
}

function visibleScoringCardSlots(
  state: GameState,
  slots: ScoringCardSlots
): ScoringCardSlots | null {
  const visibleThrough = state.phase.type === "election"
    ? state.phase.electionNumber
    : state.electionNumber;
  if (visibleThrough === 0) {
    return null;
  }
  return slots.map((slot, index) =>
    index < visibleThrough ? [...slot] : []
  ) as ScoringCardSlots;
}

function cloneScoringCardSlots(slots: ScoringCardSlots): ScoringCardSlots {
  return slots.map((slot) => [...slot]) as ScoringCardSlots;
}
