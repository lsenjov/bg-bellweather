import type {
  DistrictId,
  FirmId,
  OperationId,
  PartyId,
  ScoringCardId
} from "@bellwether/content";

export type SeatId = string;
export type ContestId = PartyId | "pecking-order";
export type BidId = string;

export type OperationInventory = Record<OperationId, number>;

export interface ResourcePool {
  clout: number;
  operations: OperationInventory;
  points: number;
}

export interface SeatConfiguration {
  id: SeatId;
  displayName: string;
  controller: "human" | "agent";
}

export interface GameConfiguration {
  seats: readonly SeatConfiguration[];
  counterbidTimerSeconds: number | null;
}

export interface SeatState extends SeatConfiguration {
  position: number;
  firmIds: FirmId[];
  reserve: ResourcePool;
  scoringCardId: ScoringCardId;
}

export interface BidPackage {
  clout: number;
  operations: OperationInventory;
}

export interface BidState extends BidPackage {
  id: BidId;
  contestId: ContestId;
  ownerSeatId: SeatId;
  firmId: FirmId;
  kind: "opening" | "counterbid";
  slotIndex: number | null;
  status: "active" | "cancelled" | "transferred";
  transferredToSeatId: SeatId | null;
}

export interface ContestState {
  id: ContestId;
  targetPartyId: PartyId | null;
  openingBidId: BidId | null;
  bidIds: BidId[];
}

export interface ChatMessage {
  id: string;
  seatId: SeatId;
  text: string;
  sentAt: number;
}

export interface ResolvedOperation {
  round: number;
  contestId: ContestId;
  bidId: BidId;
  operation: OperationId;
  choice: unknown;
  baselineApplied?: boolean;
  bonusApplied?: boolean;
  failure?: string | null;
}

export interface OpeningPhase {
  type: "opening";
  activeSeatId: SeatId;
  submittedSeatIds: SeatId[];
}

export interface CounterbidPhase {
  type: "counterbidding";
  deadlineAt: number | null;
  readySeatIds: SeatId[];
}

export interface PendingPeckingDecision {
  id: string;
  kind: "pecking_swap";
  seatId: SeatId;
  contestId: "pecking-order";
  bidId: BidId;
  adjacentIndexes: number[];
}

export interface PendingPartyOperationDecision {
  id: string;
  kind: "party_operation";
  seatId: SeatId;
  contestId: PartyId;
  bidId: BidId;
  partyId: PartyId;
  legalOperations: OperationId[];
}

export interface PendingNightDelayedDecision {
  id: string;
  kind: "night_delayed_operation";
  seatId: SeatId;
  contestId: "night-parliament";
  bidId: BidId;
  claimId: string;
  operation: "rally" | "court";
}

export type PendingDecision =
  | PendingPeckingDecision
  | PendingPartyOperationDecision
  | PendingNightDelayedDecision;

export interface DelayedBonusClaim {
  id: string;
  ownerId: SeatId;
  bidId: BidId;
  bidRank: number;
  order: number;
  operation: "rally" | "court";
}

export interface ResolutionPhase {
  type: "resolution";
  contestOrder: ContestId[];
  contestIndex: number;
  contestPrepared: boolean;
  executionBidIds: BidId[];
  bidIndex: number;
  remainingOperations: Record<BidId, OperationInventory>;
  pendingDecision: PendingDecision | null;
  claimedBonuses: OperationId[];
  delayedBonusClaims: DelayedBonusClaim[];
  delayedClaimIndex: number;
}

export interface ElectionPhase {
  type: "election";
  electionNumber: 1 | 2 | 3;
  afterRound: 4 | 8 | 12;
}

export interface CompletePhase {
  type: "complete";
  winnerSeatIds: SeatId[];
}

export type GamePhase =
  | OpeningPhase
  | CounterbidPhase
  | ResolutionPhase
  | ElectionPhase
  | CompletePhase;

export interface GameState {
  rulesetVersion: string;
  round: number;
  electionNumber: number;
  nextFirstOpenerSeatId: SeatId;
  seats: SeatState[];
  partyOrder: PartyId[];
  support: Record<DistrictId, Partial<Record<PartyId, number>>>;
  overtures: Record<PartyId, PartyId | null>;
  reinforcedOverturePartyId: PartyId | null;
  scoringDeck: ScoringCardId[];
  contests: Partial<Record<ContestId, ContestState>>;
  bids: Record<BidId, BidState>;
  counterbidSlots: Record<SeatId, Array<BidId | null>>;
  chat: ChatMessage[];
  resolvedOperations: ResolvedOperation[];
  phase: GamePhase;
  nextEntitySequence: number;
  configuration: {
    counterbidTimerSeconds: number | null;
  };
}

export interface OpeningBidInput {
  firmId: FirmId;
  partyId: PartyId;
  clout: number;
  operations: OperationInventory;
}

export interface CounterbidInput {
  contestId: ContestId;
  firmId: FirmId;
  clout: number;
  operations: OperationInventory;
}

export type GameAction =
  | {
      type: "submit_openings";
      seatId: SeatId;
      openings: OpeningBidInput[];
      now: number;
    }
  | {
      type: "set_counterbid";
      seatId: SeatId;
      slotIndex: number;
      bid: CounterbidInput | null;
    }
  | {
      type: "set_counterbid_ready";
      seatId: SeatId;
      ready: boolean;
    }
  | {
      type: "expire_counterbids";
      now: number;
    }
  | {
      type: "resolve_pecking_swap";
      seatId: SeatId;
      decisionId: string;
      adjacentIndex: number;
    }
  | {
      type: "resolve_party_operation";
      seatId: SeatId;
      decisionId: string;
      operation: OperationId;
      choice: unknown;
    }
  | {
      type: "complete_election";
      randomValues: number[];
    }
  | {
      type: "post_chat";
      seatId: SeatId;
      text: string;
      now: number;
    }
  | {
      type: "give_resources";
      seatId: SeatId;
      recipientSeatId: SeatId;
      resources: ResourcePool;
    };

export interface GameInitializedEvent {
  type: "game_initialized";
  state: GameState;
}

export interface ActionAppliedEvent {
  type: "action_applied";
  action: GameAction;
}

export type GameEvent = GameInitializedEvent | ActionAppliedEvent;

export interface RandomSource {
  integer(maxExclusive: number): number;
}

export class GameRuleError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
