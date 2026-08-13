import {
  DISTRICTS,
  DISTRICT_IDS,
  DOUBLED_PLAYER_SETUP,
  ELECTION_YEARS,
  FIRM_IDS,
  INITIAL_SUPPORT_DISTRICTS,
  OPERATION_IDS,
  PARTY_IDS,
  RULESET_VERSION,
  SCORING_CARD_IDS,
  SCORING_CARD_PAIRS,
  SCORING_CARDS_BY_ID,
  STANDARD_PLAYER_SETUP,
  type FirmId,
  type OperationId,
  type PartyId,
  type PlayerSetup,
  type ScoringCardId
} from "@bellweather/content";
import {
  retainElectionSupport,
  scoreElectionDay,
  toElectionScoringCard,
  type ElectionPlayer
} from "./election.js";
import type {
  GameAction,
  GameConfiguration,
  GameEvent,
  GameInitializedEvent,
  GameState,
  LobbyActionRecord,
  LobbyPhase,
  OperationInventory,
  OperationPlayInput,
  PartyYearState,
  RandomSource,
  ScoringCardSlots,
  SeatId,
  SeatState
} from "./model.js";
import { GameRuleError } from "./model.js";
import {
  PARTY_BONUSES,
  resolveOperation,
  type OperationChoice,
  type OperationState
} from "./operations.js";

export function initializeGame(
  configuration: GameConfiguration,
  random: RandomSource
): GameInitializedEvent {
  validateConfiguration(configuration);
  const setup = playerSetup(configuration.seats.length);
  const scoringDeck = configuration.seats.length <= 3
    ? shuffle([...SCORING_CARD_PAIRS], random).flatMap((pair) => [...pair])
    : shuffle([...SCORING_CARD_IDS], random);
  const scoringCards = dealScoringCards(
    scoringDeck,
    configuration.seats.length
  );
  const earlyBirdIndex = random.integer(configuration.seats.length);
  validateRandomInteger(earlyBirdIndex, configuration.seats.length);
  const seats = configuration.seats.map((seat, position): SeatState => ({
    ...seat,
    position,
    firmIds: FIRM_IDS.slice(
      position * setup.firms,
      position * setup.firms + setup.firms
    ),
    operations: operationInventory(setup.operations),
    newYearOperations: emptyOperationInventory(),
    collectionCounters: setup.collectionCounters,
    collectionCounterLimit: setup.collectionCounters,
    points: setup.points,
    scoringCardIds: scoringCards[position]!
  }));

  const support = Object.fromEntries(
    DISTRICT_IDS.map((districtId) => [districtId, {}])
  ) as GameState["support"];
  for (const districtId of INITIAL_SUPPORT_DISTRICTS) {
    for (const partyId of PARTY_IDS) {
      support[districtId][partyId] = 1;
    }
  }
  const courtSupport = Object.fromEntries(
    PARTY_IDS.map((partyId) => [partyId, {}])
  ) as GameState["courtSupport"];
  const coalitionTargets = Object.fromEntries(
    PARTY_IDS.map((partyId) => [partyId, null])
  ) as GameState["coalitionTargets"];
  const earlyBirdSeatId = seats[earlyBirdIndex]!.id;
  const state: GameState = {
    rulesetVersion: RULESET_VERSION,
    year: 1,
    electionNumber: 0,
    earlyBirdSeatId,
    seats,
    parties: {},
    support,
    courtSupport,
    coalitionTargets,
    chat: [],
    lobbyActions: [],
    resolvedOperations: [],
    yearHistory: [],
    electionHistory: [],
    phase: openingPhase(seats, earlyBirdSeatId),
    nextEntitySequence: 1
  };
  return { type: "game_initialized", state };
}

export function decide(state: GameState, action: GameAction): GameEvent[] {
  applyAction(state, action);
  return [{ type: "action_applied", action }];
}

export function evolve(
  state: GameState | undefined,
  event: GameEvent
): GameState {
  if (event.type === "game_initialized") {
    if (state !== undefined) {
      throw new GameRuleError("already_initialized", "The game is already initialized");
    }
    assertCurrentRuleset(event.state);
    return structuredClone(event.state);
  }
  if (state === undefined) {
    throw new GameRuleError("not_initialized", "The game has not been initialized");
  }
  return applyAction(state, event.action);
}

export function executeAction(
  state: GameState,
  action: GameAction
): { state: GameState; events: GameEvent[] } {
  const events = decide(state, action);
  return {
    state: events.reduce<GameState>(
      (current, event) => evolve(current, event),
      state
    ),
    events
  };
}

export function createElectionAction(
  state: GameState,
  random: RandomSource
): Extract<GameAction, { type: "complete_election" }> {
  assertCurrentRuleset(state);
  const phase = requirePhase(state, "election");
  if (phase.resultsRecorded) {
    throw new GameRuleError(
      "election_already_scored",
      "Election results are already recorded"
    );
  }
  const randomValues: number[] = [];
  scoreElectionDay({
    state: toOperationState(state),
    players: electionPlayers(state, phase.electionNumber),
    random: () => {
      const value = random.integer(1_000_000);
      validateRandomInteger(value, 1_000_000);
      const normalized = value / 1_000_000;
      randomValues.push(normalized);
      return normalized;
    },
    finalElection: phase.afterYear === 12
  });
  return { type: "complete_election", randomValues };
}

export function replay(events: readonly GameEvent[]): GameState {
  let state: GameState | undefined;
  for (const event of events) {
    state = evolve(state, event);
  }
  if (state === undefined) {
    throw new GameRuleError("not_initialized", "The event stream is empty");
  }
  return state;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  assertCurrentRuleset(state);
  const next = structuredClone(state);
  if (next.phase.type === "complete") {
    throw new GameRuleError("game_complete", "The game is complete");
  }
  switch (action.type) {
    case "open_party":
      openParty(next, action.seatId, action.firmId, action.partyId);
      break;
    case "operate":
      operate(next, action.seatId, action.partyId, action.plays);
      break;
    case "collect":
      collect(next, action.seatId, action.partyId);
      break;
    case "close":
      close(next, action.seatId, action.partyId);
      break;
    case "pass":
      pass(next, action.seatId);
      break;
    case "complete_election":
      completeElection(next, action.randomValues);
      break;
    case "set_election_ready":
      setElectionReady(next, action.seatId, action.ready);
      break;
    case "post_chat":
      postChat(next, action.seatId, action.text, action.now);
      break;
  }
  return next;
}

function openParty(
  state: GameState,
  seatId: SeatId,
  firmId: FirmId,
  partyId: PartyId
): void {
  const phase = requirePhase(state, "opening");
  if (phase.turnSeatIds[phase.turnIndex] !== seatId) {
    throw new GameRuleError("not_active_seat", "It is another player's opening turn");
  }
  const seat = getSeat(state, seatId);
  if (!seat.firmIds.includes(firmId)) {
    throw new GameRuleError("invalid_firm", "That firm does not belong to this player");
  }
  if (!(PARTY_IDS as readonly string[]).includes(partyId)) {
    throw new GameRuleError("unknown_party", "The party does not exist");
  }
  if (state.parties[partyId] !== undefined) {
    throw new GameRuleError("party_already_open", "That party is already open");
  }
  if (Object.values(state.parties).some((party) => party?.firmId === firmId)) {
    throw new GameRuleError("firm_already_used", "That firm has already opened a party");
  }
  state.parties[partyId] = {
    partyId,
    firmId,
    ownerSeatId: seatId,
    status: "open",
    operations: emptyOperationInventory(),
    claimedBonuses: []
  };
  phase.turnIndex += 1;
  if (phase.turnIndex === phase.turnSeatIds.length) {
    state.phase = lobbyPhase(state.seats, state.earlyBirdSeatId);
  }
}

function operate(
  state: GameState,
  seatId: SeatId,
  partyId: PartyId,
  plays: OperationPlayInput[]
): void {
  const phase = requireLobbyTurn(state, seatId);
  const party = requireOpenParty(state, partyId);
  if (!Array.isArray(plays) || plays.length < 1 || plays.length > 3) {
    throw new GameRuleError("invalid_operation_count", "Operate requires one to three cards");
  }
  if (plays.filter((play) => play.claimBonus === true).length > 1) {
    throw new GameRuleError(
      "too_many_bonuses",
      "One Operate action can claim at most one bonus"
    );
  }
  const seat = getSeat(state, seatId);
  const required = emptyOperationInventory();
  for (const play of plays) {
    if (!(OPERATION_IDS as readonly string[]).includes(play.operation)) {
      throw new GameRuleError("unknown_operation", "The Operation does not exist");
    }
    required[play.operation] += 1;
  }
  for (const operation of OPERATION_IDS) {
    if (required[operation] > seat.operations[operation]) {
      throw new GameRuleError("insufficient_operations", "The player lacks those Operation cards");
    }
  }

  for (const play of plays) {
    const choice = operationChoice(play.choice);
    if (choice.operation !== play.operation) {
      throw new GameRuleError("operation_choice_mismatch", "The choice must match its Operation card");
    }
    if (play.claimBonus === true) {
      if (PARTY_BONUSES[partyId][play.operation] === undefined) {
        throw new GameRuleError("bonus_unavailable", "This party has no matching bonus");
      }
      if (party.claimedBonuses.includes(play.operation)) {
        throw new GameRuleError("bonus_claimed", "That party bonus was already claimed this year");
      }
    }
    const resolution = resolveOperation(toOperationState(state), {
      party: partyId,
      choice,
      claimBonus: play.claimBonus === true
    });
    if (!resolution.baselineApplied) {
      throw new GameRuleError(
        "illegal_operation",
        resolution.bonusFailure ?? resolution.failure ?? "The Operation is illegal"
      );
    }
    if (play.claimBonus === true && !resolution.bonusApplied) {
      throw new GameRuleError(
        "illegal_bonus",
        resolution.bonusFailure ?? "The bonus is illegal"
      );
    }
    applyOperationState(state, resolution.state);
    seat.operations[play.operation] -= 1;
    party.operations[play.operation] += 1;
    if (resolution.bonusApplied) {
      party.claimedBonuses.push(play.operation);
    }
    state.resolvedOperations.push({
      year: state.year,
      turn: phase.turn,
      seatId,
      partyId,
      operation: play.operation,
      choice: structuredClone(choice),
      bonusApplied: resolution.bonusApplied,
      bonusName: resolution.bonusName
    });
  }

  recordLobbyAction(state, phase, {
    seatId,
    type: "operate",
    partyId,
    operationCount: plays.length,
    cardCount: plays.length
  });
  finishLobbyTurn(state, phase);
}

function collect(state: GameState, seatId: SeatId, partyId: PartyId): void {
  const phase = requireLobbyTurn(state, seatId);
  const party = requireOpenParty(state, partyId);
  const seat = getSeat(state, seatId);
  const cardCount = operationCount(party.operations);
  if (cardCount === 0) {
    throw new GameRuleError("empty_party_pile", "Collect requires a non-empty party pile");
  }
  if (seat.collectionCounters < 1) {
    throw new GameRuleError("no_collection_counter", "No Collection counter is available");
  }
  addOperations(seat.newYearOperations, party.operations);
  party.operations = emptyOperationInventory();
  seat.collectionCounters -= 1;
  recordLobbyAction(state, phase, {
    seatId,
    type: "collect",
    partyId,
    operationCount: 0,
    cardCount
  });
  finishLobbyTurn(state, phase);
}

function close(state: GameState, seatId: SeatId, partyId: PartyId): void {
  const phase = requireLobbyTurn(state, seatId);
  if ((phase.turnsTaken[seatId] ?? 0) === 0) {
    throw new GameRuleError("close_on_first_turn", "Close is unavailable on a player's first Lobby turn");
  }
  const party = requireOpenParty(state, partyId);
  if (party.ownerSeatId !== seatId) {
    throw new GameRuleError("not_party_opener", "Only the opening player can close this party");
  }
  const cardCount = operationCount(party.operations);
  closeParty(state, party);
  recordLobbyAction(state, phase, {
    seatId,
    type: "close",
    partyId,
    operationCount: 0,
    cardCount
  });
  markTurnTaken(phase, seatId);
  phase.consecutivePasses = 0;
  const parties = Object.values(state.parties).filter(
    (candidate): candidate is PartyYearState => candidate !== undefined
  );
  const closedCount = parties.filter((candidate) => candidate.status === "closed").length;
  if (closedCount > parties.length / 2) {
    closeEveryParty(state);
    finishYear(state, seatId, "majority_closed");
    return;
  }
  advanceLobbyTurn(state, phase);
}

function pass(state: GameState, seatId: SeatId): void {
  const phase = requireLobbyTurn(state, seatId);
  recordLobbyAction(state, phase, {
    seatId,
    type: "pass",
    partyId: null,
    operationCount: 0,
    cardCount: 0
  });
  markTurnTaken(phase, seatId);
  phase.consecutivePasses += 1;
  if (phase.consecutivePasses === state.seats.length) {
    closeEveryParty(state);
    finishYear(state, seatId, "passes");
    return;
  }
  advanceLobbyTurn(state, phase);
}

function finishLobbyTurn(
  state: GameState,
  phase: LobbyPhase
): void {
  markTurnTaken(phase, phase.activeSeatId);
  phase.consecutivePasses = 0;
  advanceLobbyTurn(state, phase);
}

function closeParty(state: GameState, party: PartyYearState): void {
  if (party.status === "closed") {
    return;
  }
  const owner = getSeat(state, party.ownerSeatId);
  addOperations(owner.newYearOperations, party.operations);
  party.operations = emptyOperationInventory();
  party.status = "closed";
}

function closeEveryParty(state: GameState): void {
  for (const party of Object.values(state.parties)) {
    if (party !== undefined) {
      closeParty(state, party);
    }
  }
}

function finishYear(
  state: GameState,
  endedBySeatId: SeatId,
  endReason: "passes" | "majority_closed"
): void {
  state.yearHistory.push({
    year: state.year,
    earlyBirdSeatId: state.earlyBirdSeatId,
    endedBySeatId,
    endReason,
    parties: structuredClone(state.parties),
    actions: structuredClone(state.lobbyActions),
    operations: structuredClone(state.resolvedOperations)
  });
  for (const seat of state.seats) {
    addOperations(seat.operations, seat.newYearOperations);
    seat.newYearOperations = emptyOperationInventory();
    seat.collectionCounters = seat.collectionCounterLimit;
  }
  for (const party of Object.values(state.parties)) {
    if (party !== undefined) {
      party.claimedBonuses = [];
    }
  }
  state.earlyBirdSeatId = endedBySeatId;
  if ((ELECTION_YEARS as readonly number[]).includes(state.year)) {
    state.phase = {
      type: "election",
      electionNumber: (state.year / 4) as 1 | 2 | 3,
      afterYear: state.year as 4 | 8 | 12,
      resultsRecorded: false,
      readySeatIds: []
    };
    return;
  }
  beginNextYear(state);
}

function completeElection(state: GameState, randomValues: number[]): void {
  const phase = requirePhase(state, "election");
  if (phase.resultsRecorded) {
    throw new GameRuleError("election_already_scored", "Election results are already recorded");
  }
  let randomIndex = 0;
  const result = scoreElectionDay({
    state: toOperationState(state),
    players: electionPlayers(state, phase.electionNumber),
    random: () => {
      const value = randomValues[randomIndex];
      randomIndex += 1;
      if (value === undefined) {
        throw new GameRuleError("missing_random_value", "Election random values are incomplete");
      }
      return value;
    },
    finalElection: phase.afterYear === 12
  });
  if (randomIndex !== randomValues.length) {
    throw new GameRuleError("extra_random_value", "Election random values contain unused entries");
  }
  state.support = retainElectionSupport(
    toOperationState(state).districts,
    result.draws
  ) as GameState["support"];
  for (const score of result.scores) {
    getSeat(state, score.playerId).points = score.resultingPoints;
  }
  state.courtSupport = Object.fromEntries(
    PARTY_IDS.map((partyId) => [partyId, {}])
  ) as GameState["courtSupport"];
  state.electionNumber = phase.electionNumber;
  const scoringCards = state.seats.map((seat) => {
    const scoringCardIds = [...seat.scoringCardIds[phase.electionNumber - 1]!];
    return {
      seatId: seat.id,
      scoringCardIds,
      capitalCardId: scoringCardIds[0]!
    };
  });
  state.electionHistory.push({
    electionNumber: phase.electionNumber,
    afterYear: phase.afterYear,
    scoringCards,
    draws: result.draws as GameState["electionHistory"][number]["draws"],
    scores: result.scores,
    winnerSeatIds: result.winnerIds
  });
  phase.resultsRecorded = true;
}

function setElectionReady(
  state: GameState,
  seatId: SeatId,
  ready: boolean
): void {
  const phase = requirePhase(state, "election");
  if (!phase.resultsRecorded) {
    throw new GameRuleError("election_not_scored", "Election results are not ready");
  }
  getSeat(state, seatId);
  phase.readySeatIds = ready
    ? [...new Set([...phase.readySeatIds, seatId])]
    : phase.readySeatIds.filter((candidate) => candidate !== seatId);
  if (phase.readySeatIds.length !== state.seats.length) {
    return;
  }
  if (phase.afterYear === 12) {
    state.phase = {
      type: "complete",
      winnerSeatIds: [...state.electionHistory.at(-1)!.winnerSeatIds]
    };
    return;
  }
  beginNextYear(state);
}

function beginNextYear(state: GameState): void {
  state.year += 1;
  state.parties = {};
  state.lobbyActions = [];
  state.resolvedOperations = [];
  state.phase = openingPhase(state.seats, state.earlyBirdSeatId);
}

function postChat(
  state: GameState,
  seatId: SeatId,
  text: string,
  now: number
): void {
  getSeat(state, seatId);
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 2_000) {
    throw new GameRuleError("invalid_chat", "Chat must contain 1–2,000 characters");
  }
  state.chat.push({
    id: nextEntityId(state, "message"),
    seatId,
    text: trimmed,
    sentAt: now
  });
}

function recordLobbyAction(
  state: GameState,
  phase: LobbyPhase,
  input: Omit<LobbyActionRecord, "id" | "year" | "turn">
): void {
  state.lobbyActions.push({
    id: nextEntityId(state, "action"),
    year: state.year,
    turn: phase.turn,
    ...input
  });
}

function markTurnTaken(phase: LobbyPhase, seatId: SeatId): void {
  phase.turnsTaken[seatId] = (phase.turnsTaken[seatId] ?? 0) + 1;
}

function advanceLobbyTurn(state: GameState, phase: LobbyPhase): void {
  const seatIndex = state.seats.findIndex((seat) => seat.id === phase.activeSeatId);
  phase.activeSeatId = state.seats[(seatIndex + 1) % state.seats.length]!.id;
  phase.turn += 1;
}

function requireLobbyTurn(state: GameState, seatId: SeatId): LobbyPhase {
  const phase = requirePhase(state, "lobby");
  if (phase.activeSeatId !== seatId) {
    throw new GameRuleError("not_active_seat", "It is another player's Lobby turn");
  }
  return phase;
}

function requireOpenParty(state: GameState, partyId: PartyId): PartyYearState {
  const party = state.parties[partyId];
  if (party === undefined) {
    throw new GameRuleError("party_unavailable", "That party was not opened this year");
  }
  if (party.status !== "open") {
    throw new GameRuleError("party_closed", "That party is closed for this year");
  }
  return party;
}

function operationChoice(value: unknown): OperationChoice {
  if (typeof value !== "object" || value === null || !("operation" in value)) {
    throw new GameRuleError("invalid_operation_choice", "An Operation choice is required");
  }
  const choice = value as Record<string, unknown>;
  const operation = choice.operation;
  if (!(OPERATION_IDS as readonly unknown[]).includes(operation)) {
    throw new GameRuleError("invalid_operation_choice", "The Operation choice has an unknown family");
  }
  if (operation === "organise") {
    requireDistrictId(choice.destinationDistrictId, "destinationDistrictId");
    optionalDistrictId(choice.sourceDistrictId, "sourceDistrictId");
  } else if (operation === "rally") {
    requireDistrictId(choice.districtId, "districtId");
    optionalDistrictId(choice.bonusDistrictId, "bonusDistrictId");
    if (choice.bonusDistrictIds !== undefined) {
      if (!Array.isArray(choice.bonusDistrictIds)) {
        throw new GameRuleError("invalid_operation_choice", "bonusDistrictIds must be an array");
      }
      for (const districtId of choice.bonusDistrictIds) {
        requireDistrictId(districtId, "bonusDistrictIds");
      }
    }
  } else if (operation === "smear") {
    requireDistrictId(choice.districtId, "districtId");
    requirePartyId(choice.rivalParty, "rivalParty");
    optionalPartyId(choice.bonusCourtParty, "bonusCourtParty");
  } else {
    requirePartyId(choice.targetParty, "targetParty");
    optionalDistrictId(choice.bonusDistrictId, "bonusDistrictId");
    optionalDistrictId(choice.bonusSourceDistrictId, "bonusSourceDistrictId");
    optionalPartyId(choice.bonusCourtSourceParty, "bonusCourtSourceParty");
  }
  return choice as unknown as OperationChoice;
}

function requireDistrictId(value: unknown, field: string): asserts value is string {
  if (!(DISTRICT_IDS as readonly unknown[]).includes(value)) {
    throw new GameRuleError("invalid_operation_choice", `${field} must name a district`);
  }
}

function optionalDistrictId(value: unknown, field: string): void {
  if (value !== undefined) {
    requireDistrictId(value, field);
  }
}

function requirePartyId(value: unknown, field: string): asserts value is PartyId {
  if (!(PARTY_IDS as readonly unknown[]).includes(value)) {
    throw new GameRuleError("invalid_operation_choice", `${field} must name a party`);
  }
}

function optionalPartyId(value: unknown, field: string): void {
  if (value !== undefined) {
    requirePartyId(value, field);
  }
}

function electionPlayers(
  state: GameState,
  electionNumber: 1 | 2 | 3
): ElectionPlayer[] {
  return state.seats.map((seat) => {
    const cards = seat.scoringCardIds[electionNumber - 1]!.map((cardId) =>
      toElectionScoringCard(SCORING_CARDS_BY_ID[cardId])
    );
    return {
      id: seat.id,
      position: seat.position,
      points: seat.points,
      cards,
      capitalCard: cards[0]!
    };
  });
}

export function openingTurnSeatIds(
  seats: readonly Pick<SeatState, "id" | "position">[],
  firstSeatId: SeatId
): SeatId[] {
  const ordered = [...seats].sort((left, right) => left.position - right.position);
  const firstIndex = ordered.findIndex((seat) => seat.id === firstSeatId);
  if (firstIndex < 0) {
    throw new GameRuleError("unknown_early_bird", "The Early Bird seat does not exist");
  }
  const clockwise = ordered.map(
    (_, index) => ordered[(firstIndex + index) % ordered.length]!.id
  );
  return ordered.length <= 3
    ? [...clockwise, ...clockwise.toReversed()]
    : clockwise;
}

function openingPhase(
  seats: readonly SeatState[],
  earlyBirdSeatId: SeatId
): GameState["phase"] {
  return {
    type: "opening",
    turnSeatIds: openingTurnSeatIds(seats, earlyBirdSeatId),
    turnIndex: 0
  };
}

function lobbyPhase(
  seats: readonly SeatState[],
  earlyBirdSeatId: SeatId
): LobbyPhase {
  return {
    type: "lobby",
    activeSeatId: earlyBirdSeatId,
    turn: 1,
    turnsTaken: Object.fromEntries(seats.map((seat) => [seat.id, 0])),
    consecutivePasses: 0
  };
}

export function dealScoringCards(
  deck: readonly ScoringCardId[],
  playerCount: number
): ScoringCardSlots[] {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new GameRuleError("invalid_player_count", "Scoring cards require two to six players");
  }
  const cardsPerSlot = playerCount <= 3 ? 2 : 1;
  const required = playerCount * 3 * cardsPerSlot;
  if (deck.length < required) {
    throw new GameRuleError("insufficient_scoring_cards", "The scoring deck is too small");
  }
  if (cardsPerSlot === 2) {
    for (let index = 0; index < required; index += 2) {
      const first = deck[index];
      const second = deck[index + 1];
      if (!SCORING_CARD_PAIRS.some(
        (pair) => pair[0] === first && pair[1] === second
      )) {
        throw new GameRuleError(
          "invalid_scoring_pair",
          "Low-player scoring cards must be arranged as registered pairs"
        );
      }
    }
  }
  const slots = Array.from(
    { length: playerCount },
    (): ScoringCardSlots => [[], [], []]
  );
  let cardIndex = 0;
  for (let electionIndex = 0; electionIndex < 3; electionIndex += 1) {
    for (let seatIndex = 0; seatIndex < playerCount; seatIndex += 1) {
      slots[seatIndex]![electionIndex] = deck.slice(
        cardIndex,
        cardIndex + cardsPerSlot
      );
      cardIndex += cardsPerSlot;
    }
  }
  return slots;
}

export function toOperationState(state: GameState): OperationState {
  return {
    districts: Object.fromEntries(
      DISTRICTS.map((district) => [
        district.id,
        {
          id: district.id,
          capacity: district.capacity,
          neighbors: [...district.adjacentDistrictIds],
          support: { ...state.support[district.id] }
        }
      ])
    ),
    courtSupport: structuredClone(state.courtSupport),
    coalitionTargets: { ...state.coalitionTargets }
  };
}

function applyOperationState(state: GameState, operationState: OperationState): void {
  state.support = Object.fromEntries(
    DISTRICT_IDS.map((districtId) => [
      districtId,
      { ...operationState.districts[districtId]!.support }
    ])
  ) as GameState["support"];
  state.courtSupport = structuredClone(operationState.courtSupport);
  state.coalitionTargets = { ...operationState.coalitionTargets };
}

export function operationCount(operations: Readonly<OperationInventory>): number {
  return OPERATION_IDS.reduce((total, operation) => total + operations[operation], 0);
}

export function emptyOperationInventory(): OperationInventory {
  return { organise: 0, rally: 0, smear: 0, court: 0 };
}

function operationInventory(
  operations: Readonly<Record<OperationId, number>>
): OperationInventory {
  return Object.fromEntries(
    OPERATION_IDS.map((operation) => [operation, operations[operation]])
  ) as OperationInventory;
}

function addOperations(target: OperationInventory, added: OperationInventory): void {
  for (const operation of OPERATION_IDS) {
    target[operation] += added[operation];
  }
}

function playerSetup(playerCount: number): PlayerSetup {
  return playerCount <= 3 ? DOUBLED_PLAYER_SETUP : STANDARD_PLAYER_SETUP;
}

function getSeat(state: GameState, seatId: SeatId): SeatState {
  const seat = state.seats.find((candidate) => candidate.id === seatId);
  if (seat === undefined) {
    throw new GameRuleError("unknown_seat", "The player seat does not exist");
  }
  return seat;
}

function requirePhase<T extends GameState["phase"]["type"]>(
  state: GameState,
  type: T
): Extract<GameState["phase"], { type: T }> {
  if (state.phase.type !== type) {
    throw new GameRuleError("wrong_phase", `This action requires the ${type} phase`);
  }
  return state.phase as Extract<GameState["phase"], { type: T }>;
}

function nextEntityId(state: GameState, prefix: string): string {
  const id = `${prefix}-${state.nextEntitySequence}`;
  state.nextEntitySequence += 1;
  return id;
}

function validateConfiguration(configuration: GameConfiguration): void {
  if (configuration.seats.length < 2 || configuration.seats.length > 6) {
    throw new GameRuleError("invalid_player_count", "The game requires two to six players");
  }
  const ids = new Set<string>();
  for (const seat of configuration.seats) {
    if (seat.id.trim().length === 0 || seat.displayName.trim().length === 0) {
      throw new GameRuleError("invalid_seat", "Every player requires an id and display name");
    }
    if (ids.has(seat.id)) {
      throw new GameRuleError("duplicate_seat", "Player ids must be unique");
    }
    ids.add(seat.id);
  }
}

export function assertCurrentRuleset(state: GameState): void {
  if (state.rulesetVersion !== RULESET_VERSION) {
    throw new GameRuleError(
      "unsupported_ruleset",
      `Only ruleset ${RULESET_VERSION} is supported`
    );
  }
}

function shuffle<T>(values: T[], random: RandomSource): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selected = random.integer(index + 1);
    validateRandomInteger(selected, index + 1);
    [values[index], values[selected]] = [values[selected]!, values[index]!];
  }
  return values;
}

function validateRandomInteger(value: number, maxExclusive: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new GameRuleError("invalid_random_value", "Random source returned an invalid value");
  }
}
