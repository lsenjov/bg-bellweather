import type {
  BonusCardId,
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
}

export type BonusCardLocation =
  | { zone: "home" }
  | { zone: "new_year"; seatId: SeatId }
  | { zone: "hand"; seatId: SeatId };

export interface ChatMessage {
  id: string;
  seatId: SeatId;
  text: string;
  sentAt: number;
}

export type OperationPlayInput =
  | {
      cardType: "operation";
      operation: OperationId;
      choice: unknown;
    }
  | {
      cardType: "bonus";
      bonusCardId: BonusCardId;
      choice: unknown;
    };

export interface ResolvedOperation {
  year: number;
  turn: number;
  seatId: SeatId;
  partyId: PartyId;
  cardType: "operation" | "bonus";
  operation: OperationId;
  bonusCardId: BonusCardId | null;
  bonusHomePartyId: PartyId | null;
  choice: unknown;
  bonusCardReturnedHome: boolean;
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
  bonusCardId: BonusCardId | null;
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
  inProgressOperate: {
    partyId: PartyId;
    operationCount: number;
    cardCount: 1 | 2;
  } | null;
}

export interface ClosurePhase {
  type: "closure";
  endedBySeatId: SeatId;
  pendingPartyIds: PartyId[];
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
    finalCardCount: number | null;
    finalCardRankBonus: number;
    pointsChange: number;
    resultingPoints: number;
  }>;
  winnerSeatIds: SeatId[];
}

export interface YearRecord {
  year: number;
  earlyBirdSeatId: SeatId;
  endedBySeatId: SeatId;
  parties: Partial<Record<PartyId, PartyYearState>>;
  actions: LobbyActionRecord[];
  operations: ResolvedOperation[];
}

export type GamePhase =
  | OpeningPhase
  | LobbyPhase
  | ClosurePhase
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
  bonusCards: Record<BonusCardId, BonusCardLocation>;
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
      bonusCardId?: BonusCardId;
    }
  | {
      type: "close";
      seatId: SeatId;
      partyId: PartyId;
      bonusCardId?: BonusCardId;
    }
  | {
      type: "choose_closure_bonus";
      seatId: SeatId;
      partyId: PartyId;
      bonusCardId?: BonusCardId;
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
