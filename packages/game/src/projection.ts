import {
  OPERATION_IDS,
  type OperationId,
  type ScoringCardId
} from "@bellweather/content";
import type {
  BidState,
  GameState,
  OperationInventory,
  PendingDecision,
  SeatId
} from "./model.js";
import { GameRuleError } from "./model.js";
import { assertCurrentRuleset } from "./engine.js";

export interface ProjectedSeat {
  id: SeatId;
  displayName: string;
  controller: "human" | "agent";
  position: number;
  firmIds: readonly string[];
  points: number;
  reserve:
    | {
        leverage: number;
        bluff: number;
        operations: OperationInventory;
      }
    | null;
  scoringCardId: ScoringCardId | null;
}

export interface ProjectedBid {
  id: string;
  contestId: string;
  ownerSeatId: SeatId;
  firmId: string;
  kind: "opening" | "counterbid";
  status: BidState["status"];
  cardCount: number;
  leverage: number | null;
  bluff: number | null;
  operationCount: number | null;
  operations: OperationInventory | null;
}

export interface GameView {
  rulesetVersion: string;
  round: number;
  electionNumber: number;
  phase: GameState["phase"]["type"];
  deadlineAt: number | null;
  nextFirstOpenerSeatId: SeatId;
  seats: ProjectedSeat[];
  partyOrder: GameState["partyOrder"];
  support: GameState["support"];
  courtSupport: GameState["courtSupport"];
  coalitionTargets: GameState["coalitionTargets"];
  contests: GameState["contests"];
  bids: ProjectedBid[];
  readySeatIds: SeatId[];
  pendingDecision: PendingDecision | null;
  chat: GameState["chat"];
  roundHistory: GameState["roundHistory"];
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
    throw new GameRuleError("unknown_seat", "Seat does not exist");
  }

  const allRevealed =
    state.phase.type === "resolution" ||
    state.phase.type === "election" ||
    state.phase.type === "complete";
  const agendasRevealed =
    state.phase.type === "election" || state.phase.type === "complete";
  const phase = state.phase;

  return {
    rulesetVersion: state.rulesetVersion,
    round: state.round,
    electionNumber: state.electionNumber,
    phase: phase.type,
    deadlineAt: phase.type === "counterbidding" ? phase.deadlineAt : null,
    nextFirstOpenerSeatId: state.nextFirstOpenerSeatId,
    seats: state.seats.map((seat) => {
      const own = viewerSeatId === seat.id;
      return {
        id: seat.id,
        displayName: seat.displayName,
        controller: seat.controller,
        position: seat.position,
        firmIds: seat.firmIds,
        points: seat.reserve.points,
        reserve:
          own || fullInformation
            ? {
                leverage: seat.reserve.leverage,
                bluff: seat.reserve.bluff,
                operations: { ...seat.reserve.operations }
              }
            : null,
        scoringCardId:
          own || agendasRevealed || fullInformation
            ? seat.scoringCardId
            : null
      };
    }),
    partyOrder: [...state.partyOrder],
    support: structuredClone(state.support),
    courtSupport: structuredClone(state.courtSupport),
    coalitionTargets: { ...state.coalitionTargets },
    contests: structuredClone(state.contests),
    bids: Object.values(state.bids).map((bid) =>
      projectBid(bid, viewerSeatId, allRevealed || fullInformation)
    ),
    readySeatIds:
      phase.type === "counterbidding" ? [...phase.readySeatIds] : [],
    pendingDecision:
      phase.type === "resolution"
        ? structuredClone(phase.pendingDecision)
        : null,
    chat: structuredClone(state.chat),
    roundHistory: structuredClone(state.roundHistory),
    electionHistory: structuredClone(state.electionHistory)
  };
}

function projectBid(
  bid: BidState,
  viewerSeatId: SeatId | null,
  allRevealed: boolean
): ProjectedBid {
  const own = bid.ownerSeatId === viewerSeatId;
  return {
    id: bid.id,
    contestId: bid.contestId,
    ownerSeatId: bid.ownerSeatId,
    firmId: bid.firmId,
    kind: bid.kind,
    status: bid.status,
    cardCount: bidCardCount(bid),
    leverage: own || bid.kind === "opening" || allRevealed ? bid.leverage : null,
    bluff: own || allRevealed ? bid.bluff : null,
    operationCount: own || allRevealed ? operationCount(bid.operations) : null,
    operations: own || allRevealed ? { ...bid.operations } : null
  };
}

export function bidCardCount(
  bid: Pick<BidState, "leverage" | "bluff" | "operations">
): number {
  return bid.leverage + bid.bluff + operationCount(bid.operations);
}

function operationCount(operations: Record<OperationId, number>): number {
  return OPERATION_IDS.reduce(
    (total, operation) => total + operations[operation],
    0
  );
}
