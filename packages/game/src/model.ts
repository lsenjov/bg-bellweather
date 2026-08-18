import type {
  DistrictId,
  ElectionYear,
  FirmId,
  OperationId,
  PartyId,
  ScoringCardId
} from "@bellweather/content";

export type SeatId = string;
export type OperationInventory = Record<OperationId, number>;
export type ScoringCardSlots = [
  ScoringCardId[],
  ScoringCardId[],
  ScoringCardId[]
];

export interface SeatConfiguration {
  id: SeatId;
  displayName: string;
  controller: "human" | "agent";
}

export interface GameConfiguration {
  seats: readonly SeatConfiguration[];
}

export interface SeatState extends SeatConfiguration {
  position: number;
  firmIds: FirmId[];
  operations: OperationInventory;
  newYearOperations: OperationInventory;
  collectionCounters: number;
  collectionCounterLimit: number;
  points: number;
  scoringCardIds: ScoringCardSlots;
}

export interface PartyYearState {
  partyId: PartyId;
  firmId: FirmId;
  ownerSeatId: SeatId;
  status: "open" | "closed";
  operations: OperationInventory;
  claimedBonuses: OperationId[];
}

export interface ChatMessage {
  id: string;
  seatId: SeatId;
  text: string;
  sentAt: number;
}

export interface OperationPlayInput {
  operation: OperationId;
  choice: unknown;
  claimBonus?: boolean;
}

export interface ResolvedOperation {
  year: number;
  turn: number;
  seatId: SeatId;
  partyId: PartyId;
  operation: OperationId;
  choice: unknown;
  bonusApplied: boolean;
  bonusName: string | null;
}

export interface LobbyActionRecord {
  id: string;
  year: number;
  turn: number;
  seatId: SeatId;
  type: "operate" | "collect" | "close" | "pass";
  partyId: PartyId | null;
  operationCount: number;
  cardCount: number;
}

export interface OpeningPhase {
  type: "opening";
  turnSeatIds: SeatId[];
  turnIndex: number;
}

export interface LobbyPhase {
  type: "lobby";
  activeSeatId: SeatId;
  turn: number;
  turnsTaken: Record<SeatId, number>;
  consecutivePasses: number;
  inProgressOperate: {
    partyId: PartyId;
    operationCount: 1 | 2;
    bonusClaimed: boolean;
  } | null;
}

export interface ElectionPhase {
  type: "election";
  electionNumber: 1 | 2 | 3;
  afterYear: ElectionYear;
  resultsRecorded: boolean;
  readySeatIds: SeatId[];
}

export interface CompletePhase {
  type: "complete";
  winnerSeatIds: SeatId[];
}

export interface ElectionRecord {
  electionNumber: 1 | 2 | 3;
  afterYear: ElectionYear;
  scoringCards: Array<{
    seatId: SeatId;
    scoringCardIds: ScoringCardId[];
    capitalCardId: ScoringCardId;
  }>;
  draws: Record<
    string,
    {
      districtId: string;
      parties: PartyId[];
    }
  >;
  scores: Array<{
    playerId: SeatId;
    baseDistrictScore: number;
    seatModifier: number;
    capitalMatches: number;
    capitalScore: number;
    pointsChange: number;
    resultingPoints: number;
  }>;
  winnerSeatIds: SeatId[];
}

export interface YearRecord {
  year: number;
  earlyBirdSeatId: SeatId;
  endedBySeatId: SeatId;
  endReason: "passes" | "majority_closed";
  parties: Partial<Record<PartyId, PartyYearState>>;
  actions: LobbyActionRecord[];
  operations: ResolvedOperation[];
}

export type GamePhase =
  | OpeningPhase
  | LobbyPhase
  | ElectionPhase
  | CompletePhase;

export interface GameState {
  rulesetVersion: string;
  year: number;
  electionNumber: number;
  earlyBirdSeatId: SeatId;
  seats: SeatState[];
  parties: Partial<Record<PartyId, PartyYearState>>;
  support: Record<DistrictId, Partial<Record<PartyId, number>>>;
  courtSupport: Record<PartyId, Partial<Record<PartyId, number>>>;
  coalitionTargets: Record<PartyId, PartyId | null>;
  chat: ChatMessage[];
  lobbyActions: LobbyActionRecord[];
  resolvedOperations: ResolvedOperation[];
  yearHistory: YearRecord[];
  electionHistory: ElectionRecord[];
  phase: GamePhase;
  nextEntitySequence: number;
}

export type GameAction =
  | {
      type: "open_party";
      seatId: SeatId;
      firmId: FirmId;
      partyId: PartyId;
    }
  | {
      type: "operate";
      seatId: SeatId;
      partyId: PartyId;
      play: OperationPlayInput;
    }
  | {
      type: "finish_operate";
      seatId: SeatId;
    }
  | {
      type: "collect";
      seatId: SeatId;
      partyId: PartyId;
    }
  | {
      type: "close";
      seatId: SeatId;
      partyId: PartyId;
    }
  | {
      type: "pass";
      seatId: SeatId;
    }
  | {
      type: "complete_election";
      randomValues: number[];
    }
  | {
      type: "set_election_ready";
      seatId: SeatId;
      ready: boolean;
    }
  | {
      type: "post_chat";
      seatId: SeatId;
      text: string;
      now: number;
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
