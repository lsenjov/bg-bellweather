import { OperationChoiceSchema } from "@bellweather/protocol";
import {
  BONUS_CARD_IDS,
  BONUS_CARDS_BY_ID,
  DISTRICTS,
  DISTRICT_IDS,
  DOUBLED_PLAYER_SETUP,
  ELECTION_YEARS,
  FINAL_ELECTION_YEAR,
  FIRM_IDS,
  INITIAL_SUPPORT_DISTRICTS,
  OPERATION_IDS,
  PARTY_IDS,
  RULESET_VERSION,
  SCORING_CARD_IDS,
  POLICY_IDS, REGION_IDS, activeLawEffects,
  SCORING_CARDS_BY_ID,
  STANDARD_PLAYER_SETUP,
  type BonusCardId,
  type FirmId,
  type OperationId,
  type PartyId,
  type PlayerSetup,
  type ScoringCardId
} from "@bellweather/content";
import {
  retainElectionSupport,
  scoreElectionDay,
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
  SeatId,
  SeatState,
  SupportChange
} from "./model.js";
import { GameRuleError } from "./model.js";
import {
  resolveOperation,
  type OperationChoice,
  type OperationState
} from "./operations.js";
import { resolveUnboundBonus } from "./unbound.js";

export function initializeGame(
  configuration: GameConfiguration,
  random: RandomSource
): GameInitializedEvent {
  validateConfiguration(configuration);
  const setup = playerSetup(configuration.seats.length);
  const scoringDeck = shuffle([...SCORING_CARD_IDS], random);
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
    scoringCardId: scoringCards[position]!
  }));

  const support = Object.fromEntries(
    DISTRICT_IDS.map((districtId) => [districtId, {}])
  ) as GameState["support"];
  for (const districtId of INITIAL_SUPPORT_DISTRICTS) {
    for (const partyId of PARTY_IDS) {
      support[districtId][partyId] = 1;
    }
  }
  const earlyBirdSeatId = seats[earlyBirdIndex]!.id;
  const state: GameState = {
    rulesetVersion: RULESET_VERSION,
    year: 1,
    electionNumber: 0,
    earlyBirdSeatId,
    seats,
    parties: {},
    support,
    policyDeck: shuffle([...POLICY_IDS], random),
    pendingPolicies: {},
    enactedPolicyIds: [],
    discardedPolicyIds: [],
    bonusCards: Object.fromEntries(
      BONUS_CARD_IDS.map((cardId) => [cardId, { zone: "home" }])
    ) as GameState["bonusCards"],
    chat: [],
    lobbyActions: [],
    resolvedOperations: [],
    yearHistory: [],
    electionHistory: [],
    phase: openingPhase(seats, earlyBirdSeatId),
    nextEntitySequence: 1
  };
  dealPolicies(state);
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
    players: electionPlayers(state),
    pendingPolicies: state.pendingPolicies,
    enactedPolicyIds: state.enactedPolicyIds,
    random: () => {
      const value = random.integer(1_000_000);
      validateRandomInteger(value, 1_000_000);
      const normalized = value / 1_000_000;
      randomValues.push(normalized);
      return normalized;
    },
    finalElection: phase.afterYear === FINAL_ELECTION_YEAR
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
      operate(next, action.seatId, action.partyId, action.play);
      break;
    case "finish_operate":
      finishOperate(next, action.seatId);
      break;
    case "collect":
      collect(next, action.seatId, action.partyId, action.bonusCardId);
      break;
    case "close":
      close(next, action.seatId, action.partyId, action.bonusCardId);
      break;
    case "choose_closure_bonus":
      chooseClosureBonus(
        next,
        action.seatId,
        action.partyId,
        action.bonusCardId
      );
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
    operations: emptyOperationInventory()
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
  play: OperationPlayInput
): void {
  const phase = requireLobbyTurn(state, seatId);
  if (
    phase.inProgressOperate !== null &&
    phase.inProgressOperate.partyId !== partyId
  ) {
    throw new GameRuleError(
      "operate_party_locked",
      "Every card in an Operate action must resolve at the same party"
    );
  }
  const party = requireOpenParty(state, partyId);
  const seat = getSeat(state, seatId);
  const bonusCard = play.cardType === "bonus"
    ? requirePlayableBonusCard(state, seatId, play.bonusCardId)
    : null;
  if (play.cardType === "bonus" && bonusCard?.operation === null) {
    const resolution = resolveUnboundBonus(
      state,
      seatId,
      partyId,
      play.bonusCardId,
      play.choice
    );
    state.bonusCards[play.bonusCardId] = { zone: "home" };
    state.resolvedOperations.push({
      year: state.year,
      turn: phase.turn,
      seatId,
      partyId,
      cardType: "bonus",
      operation: null,
      bonusCardId: play.bonusCardId,
      bonusHomePartyId: bonusCard.homePartyId,
      choice: structuredClone(resolution.choice),
      bonusCardReturnedHome: true
    });
    const cardCount = (phase.inProgressOperate?.cardCount ?? 0) + 1;
    const operationCount = phase.inProgressOperate?.operationCount ?? 0;
    const supportChanges = [
      ...(phase.inProgressOperate?.supportChanges ?? []),
      ...resolution.supportChanges
    ];
    if (resolution.endsLobbyAction || cardCount === 3) {
      completeOperateAction(
        state,
        phase,
        partyId,
        operationCount,
        cardCount as 1 | 2 | 3,
        supportChanges
      );
      return;
    }
    phase.inProgressOperate = {
      partyId,
      operationCount,
      cardCount: cardCount as 1 | 2,
      supportChanges
    };
    return;
  }
  const operation = play.cardType === "operation"
    ? play.operation
    : bonusCard?.operation;
  if (operation === null || operation === undefined) {
    throw new GameRuleError("unknown_operation", "The Operation does not exist");
  }
  if (!(OPERATION_IDS as readonly string[]).includes(operation)) {
    throw new GameRuleError("unknown_operation", "The Operation does not exist");
  }
  if (play.cardType === "operation" && seat.operations[operation] < 1) {
    throw new GameRuleError(
      "insufficient_operations",
      "The player lacks that Operation card"
    );
  }

  const choice = operationChoice(play.choice);
  if (choice.operation !== operation) {
    throw new GameRuleError("operation_choice_mismatch", "The choice must match its Operation card");
  }
  const resolution = resolveOperation(toOperationState(state), {
    party: partyId,
    choice,
    ...(play.cardType === "bonus" ? { bonusCardId: play.bonusCardId } : {})
  });
  if (!resolution.baselineApplied) {
    throw new GameRuleError(
      "illegal_operation",
      resolution.bonusFailure ?? resolution.failure ?? "The Operation is illegal"
    );
  }
  if (play.cardType === "bonus" && !resolution.bonusApplied) {
    throw new GameRuleError(
      "illegal_bonus",
      resolution.bonusFailure ?? "The bonus is illegal"
    );
  }
  applyOperationState(state, resolution.state);
  if (play.cardType === "operation") {
    seat.operations[operation] -= 1;
    party.operations[operation] += 1;
  } else {
    state.bonusCards[play.bonusCardId] = { zone: "home" };
  }
  state.resolvedOperations.push({
    year: state.year,
    turn: phase.turn,
    seatId,
    partyId,
    cardType: play.cardType,
    operation,
    bonusCardId: play.cardType === "bonus" ? play.bonusCardId : null,
    bonusHomePartyId: bonusCard?.homePartyId ?? null,
    choice: structuredClone(choice),
    bonusCardReturnedHome: play.cardType === "bonus"
  });
  const cardCount = (phase.inProgressOperate?.cardCount ?? 0) + 1;
  const operationCount =
    (phase.inProgressOperate?.operationCount ?? 0) +
    (play.cardType === "operation" ? 1 : 0);
  const supportChanges = [
    ...(phase.inProgressOperate?.supportChanges ?? []),
    ...resolution.supportChanges
  ];
  if (cardCount === 3) {
    completeOperateAction(
      state,
      phase,
      partyId,
      operationCount,
      3,
      supportChanges
    );
    return;
  }
  phase.inProgressOperate = {
    partyId,
    operationCount,
    cardCount: cardCount as 1 | 2,
    supportChanges
  };
}

function finishOperate(state: GameState, seatId: SeatId): void {
  const phase = requireLobbyTurn(state, seatId);
  if (phase.inProgressOperate === null) {
    throw new GameRuleError(
      "no_operate_in_progress",
      "Resolve an Operation before finishing the Operate action"
    );
  }
  completeOperateAction(
    state,
    phase,
    phase.inProgressOperate.partyId,
    phase.inProgressOperate.operationCount,
    phase.inProgressOperate.cardCount,
    phase.inProgressOperate.supportChanges
  );
}

function completeOperateAction(
  state: GameState,
  phase: LobbyPhase,
  partyId: PartyId,
  operationCount: number,
  cardCount: 1 | 2 | 3,
  supportChanges: SupportChange[]
): void {
  recordLobbyAction(state, phase, {
    seatId: phase.activeSeatId,
    type: "operate",
    partyId,
    operationCount,
    cardCount,
    bonusCardId: null,
    supportChanges
  });
  phase.inProgressOperate = null;
  finishLobbyTurn(state, phase);
}

function collect(
  state: GameState,
  seatId: SeatId,
  partyId: PartyId,
  bonusCardId?: BonusCardId
): void {
  const phase = requireLobbyTurn(state, seatId);
  requireNoOperateInProgress(phase);
  const party = requireOpenParty(state, partyId);
  const seat = getSeat(state, seatId);
  const cardCount = operationCount(party.operations);
  if (seat.collectionCounters < 1) {
    throw new GameRuleError("no_collection_counter", "No Collection counter is available");
  }
  addOperations(seat.newYearOperations, party.operations);
  party.operations = emptyOperationInventory();
  const awardedBonusCardId = awardBonusCard(
    state,
    seatId,
    partyId,
    bonusCardId
  );
  seat.collectionCounters -= 1;
  recordLobbyAction(state, phase, {
    seatId,
    type: "collect",
    partyId,
    operationCount: 0,
    cardCount,
    bonusCardId: awardedBonusCardId,
    supportChanges: []
  });
  finishLobbyTurn(state, phase);
}

function close(
  state: GameState,
  seatId: SeatId,
  partyId: PartyId,
  bonusCardId?: BonusCardId
): void {
  const phase = requireLobbyTurn(state, seatId);
  requireNoOperateInProgress(phase);
  if ((phase.turnsTaken[seatId] ?? 0) === 0) {
    throw new GameRuleError("close_on_first_turn", "Close is unavailable on a player's first Lobby turn");
  }
  const party = requireOpenParty(state, partyId);
  if (party.ownerSeatId !== seatId) {
    throw new GameRuleError("not_firm_owner", "Only the current Firm owner can close this party");
  }
  const cardCount = operationCount(party.operations);
  closeParty(state, party);
  const awardedBonusCardId = awardBonusCard(
    state,
    seatId,
    partyId,
    bonusCardId
  );
  recordLobbyAction(state, phase, {
    seatId,
    type: "close",
    partyId,
    operationCount: 0,
    cardCount,
    bonusCardId: awardedBonusCardId,
    supportChanges: []
  });
  finishLobbyTurn(state, phase);
}

function pass(state: GameState, seatId: SeatId): void {
  const phase = requireLobbyTurn(state, seatId);
  requireNoOperateInProgress(phase);
  const hasOpenFirm = Object.values(state.parties).some(
    (party) => party?.ownerSeatId === seatId && party.status === "open"
  );
  if (hasOpenFirm) {
    throw new GameRuleError(
      "open_firm_party",
      "Pass requires all of your Firm markers to have returned"
    );
  }
  recordLobbyAction(state, phase, {
    seatId,
    type: "pass",
    partyId: null,
    operationCount: 0,
    cardCount: 0,
    bonusCardId: null,
    supportChanges: []
  });
  finishLobbyTurn(state, phase);
}

function finishLobbyTurn(
  state: GameState,
  phase: LobbyPhase
): void {
  markTurnTaken(phase, phase.activeSeatId);
  const totalFirmCount = state.seats.reduce(
    (total, seat) => total + seat.firmIds.length,
    0
  );
  const activeFirmCount = new Set(
    Object.values(state.parties).flatMap((party) =>
      party?.status === "open" ? [party.firmId] : []
    )
  ).size;
  if ((totalFirmCount - activeFirmCount) * 2 > totalFirmCount) {
    beginClosure(state, phase.activeSeatId);
    return;
  }
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

function beginClosure(
  state: GameState,
  endedBySeatId: SeatId
): void {
  const pendingPartyIds = PARTY_IDS.filter((partyId) => {
    const party = state.parties[partyId];
    return party?.status === "open" && availableBonusCards(state, partyId).length > 0;
  });
  closeEveryParty(state);
  if (pendingPartyIds.length === 0) {
    finishYear(state, endedBySeatId);
    return;
  }
  state.phase = {
    type: "closure",
    endedBySeatId,
    pendingPartyIds
  };
}

function chooseClosureBonus(
  state: GameState,
  seatId: SeatId,
  partyId: PartyId,
  bonusCardId?: BonusCardId
): void {
  const phase = requirePhase(state, "closure");
  if (phase.pendingPartyIds[0] !== partyId) {
    throw new GameRuleError(
      "wrong_closure_party",
      "Resolve automatic Closure choices in party order"
    );
  }
  const party = state.parties[partyId];
  if (party === undefined || party.ownerSeatId !== seatId) {
    throw new GameRuleError(
      "not_firm_owner",
      "Only the current Firm owner can choose this Closure Bonus card"
    );
  }
  awardBonusCard(state, seatId, partyId, bonusCardId);
  phase.pendingPartyIds.shift();
  if (phase.pendingPartyIds.length === 0) {
    finishYear(state, phase.endedBySeatId);
  }
}

function finishYear(
  state: GameState,
  endedBySeatId: SeatId
): void {
  state.yearHistory.push({
    year: state.year,
    earlyBirdSeatId: state.earlyBirdSeatId,
    endedBySeatId,
    parties: structuredClone(state.parties),
    actions: structuredClone(state.lobbyActions),
    operations: structuredClone(state.resolvedOperations)
  });
  for (const seat of state.seats) {
    addOperations(seat.operations, seat.newYearOperations);
    seat.newYearOperations = emptyOperationInventory();
    seat.collectionCounters = seat.collectionCounterLimit;
  }
  for (const cardId of BONUS_CARD_IDS) {
    const location = state.bonusCards[cardId];
    if (location.zone === "new_year") {
      state.bonusCards[cardId] = { zone: "hand", seatId: location.seatId };
    }
  }
  state.parties = {};
  state.earlyBirdSeatId = endedBySeatId;
  const electionIndex = ELECTION_YEARS.findIndex((year) => year === state.year);
  if (electionIndex >= 0) {
    state.phase = {
      type: "election",
      electionNumber: (electionIndex + 1) as 1 | 2 | 3,
      afterYear: ELECTION_YEARS[electionIndex]!,
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
    players: electionPlayers(state),
    pendingPolicies: state.pendingPolicies,
    enactedPolicyIds: state.enactedPolicyIds,
    random: () => {
      const value = randomValues[randomIndex];
      randomIndex += 1;
      if (value === undefined) {
        throw new GameRuleError("missing_random_value", "Election random values are incomplete");
      }
      return value;
    },
    finalElection: phase.afterYear === FINAL_ELECTION_YEAR
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
  state.electionNumber = phase.electionNumber;
  for (const vote of result.policyVotes) {
    (vote.passed ? state.enactedPolicyIds : state.discardedPolicyIds).push(vote.policyId);
  }
  const scoringCards = phase.afterYear === FINAL_ELECTION_YEAR
    ? state.seats.map(seat => ({ seatId: seat.id, scoringCardId: seat.scoringCardId })) : [];
  state.pendingPolicies = {};
  if (phase.afterYear !== FINAL_ELECTION_YEAR) dealPolicies(state);
  state.electionHistory.push({
    electionNumber: phase.electionNumber,
    afterYear: phase.afterYear,
    scoringCards,
    policyVotes: result.policyVotes,
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
  if (phase.afterYear === FINAL_ELECTION_YEAR) {
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

function requireNoOperateInProgress(phase: LobbyPhase): void {
  if (phase.inProgressOperate !== null) {
    throw new GameRuleError(
      "operate_in_progress",
      "Finish the current Operate action before taking another Lobby action"
    );
  }
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

function availableBonusCards(
  state: GameState,
  partyId: PartyId
): BonusCardId[] {
  return BONUS_CARD_IDS.filter(
    (cardId) =>
      BONUS_CARDS_BY_ID[cardId].homePartyId === partyId &&
      state.bonusCards[cardId].zone === "home"
  );
}

function awardBonusCard(
  state: GameState,
  seatId: SeatId,
  partyId: PartyId,
  bonusCardId?: BonusCardId
): BonusCardId | null {
  if (bonusCardId === undefined) {
    return null;
  }
  if (!(BONUS_CARD_IDS as readonly string[]).includes(bonusCardId)) {
    throw new GameRuleError("unknown_bonus_card", "The Bonus card does not exist");
  }
  const card = BONUS_CARDS_BY_ID[bonusCardId];
  if (
    card.homePartyId !== partyId ||
    state.bonusCards[bonusCardId].zone !== "home"
  ) {
    throw new GameRuleError(
      "bonus_card_unavailable",
      "That Bonus card is not available at this party"
    );
  }
  state.bonusCards[bonusCardId] = { zone: "new_year", seatId };
  return bonusCardId;
}

function requirePlayableBonusCard(
  state: GameState,
  seatId: SeatId,
  bonusCardId: BonusCardId
) {
  if (!(BONUS_CARD_IDS as readonly string[]).includes(bonusCardId)) {
    throw new GameRuleError("unknown_bonus_card", "The Bonus card does not exist");
  }
  const card = BONUS_CARDS_BY_ID[bonusCardId];
  const location = state.bonusCards[bonusCardId];
  if (location.zone !== "hand" || location.seatId !== seatId) {
    throw new GameRuleError(
      "bonus_card_not_held",
      "The player does not hold that Bonus card"
    );
  }
  return card;
}

function operationChoice(value: unknown): OperationChoice {
  const parsed = OperationChoiceSchema.safeParse(value);
  if (!parsed.success) throw new GameRuleError("invalid_operation_choice", parsed.error.issues[0]?.message ?? "Invalid Operation choice");
  return parsed.data;
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

function electionPlayers(state: GameState): ElectionPlayer[] {
  return state.seats.map(seat => ({
    id: seat.id, position: seat.position, points: seat.points,
    card: SCORING_CARDS_BY_ID[seat.scoringCardId],
    finalCardCount: operationCount(seat.operations) + BONUS_CARD_IDS.filter(id => {
      const location = state.bonusCards[id];
      return location.zone === "hand" && location.seatId === seat.id;
    }).length
  }));
}

function dealPolicies(state: GameState): void {
  for (const regionId of REGION_IDS) {
    const policyId = state.policyDeck.shift();
    if (policyId === undefined) throw new GameRuleError("empty_policy_deck", "The policy deck is empty");
    state.pendingPolicies[regionId] = policyId;
  }
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
    inProgressOperate: null
  };
}

export function dealScoringCards(deck: readonly ScoringCardId[], playerCount: number): ScoringCardId[] {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) throw new GameRuleError("invalid_player_count", "Scoring cards require two to six players");
  if (deck.length < playerCount) throw new GameRuleError("insufficient_scoring_cards", "The scoring deck is too small");
  if (new Set(deck).size !== deck.length || deck.some(id => !SCORING_CARD_IDS.includes(id))) throw new GameRuleError("invalid_scoring_deck", "Scoring cards must be distinct known cards");
  return deck.slice(0, playerCount);
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
    laws: activeLawEffects(state.enactedPolicyIds)
  };
}

function applyOperationState(state: GameState, operationState: OperationState): void {
  state.support = Object.fromEntries(
    DISTRICT_IDS.map((districtId) => [
      districtId,
      { ...operationState.districts[districtId]!.support }
    ])
  ) as GameState["support"];
}

export function operationCount(operations: Readonly<OperationInventory>): number {
  return OPERATION_IDS.reduce((total, operation) => total + operations[operation], 0);
}

export function emptyOperationInventory(): OperationInventory {
  return { organise: 0, rally: 0, smear: 0 };
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
