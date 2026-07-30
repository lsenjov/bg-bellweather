import {
  DISTRICTS,
  DISTRICT_IDS,
  DOUBLED_PLAYER_SETUP,
  ELECTION_ROUNDS,
  FIRM_IDS,
  INITIAL_SUPPORT_DISTRICTS,
  OPERATION_IDS,
  PARTY_IDS,
  PARTIES_BY_ID,
  RULESET_VERSION,
  SCORING_CARD_IDS,
  SCORING_CARDS_BY_ID,
  STANDARD_PLAYER_SETUP,
  type FirmId,
  type OperationId,
  type PartyId,
  type PlayerSetup,
  type ScoringCardId
} from "@bellwether/content";
import type {
  BidPackage,
  BidState,
  CompletePhase,
  ContestId,
  ContestState,
  CounterbidInput,
  GameAction,
  GameConfiguration,
  GameEvent,
  GameInitializedEvent,
  GameState,
  OpeningBidInput,
  OperationInventory,
  PendingDecision,
  RandomSource,
  ResolutionPhase,
  ResourcePool,
  SeatId,
  SeatState
} from "./model.js";
import { GameRuleError } from "./model.js";
import {
  scoreElectionDay,
  type ElectionPlayer,
  type ScoringCard
} from "./election.js";
import {
  resolveNightDelayedOperations,
  resolveOperation,
  type NightDelayedClaim,
  type OperationChoice,
  type OperationRequest,
  type OperationState
} from "./operations.js";

export function initializeGame(
  configuration: GameConfiguration,
  random: RandomSource
): GameInitializedEvent {
  validateConfiguration(configuration);
  const setup =
    configuration.seats.length <= 3
      ? DOUBLED_PLAYER_SETUP
      : STANDARD_PLAYER_SETUP;
  const partyOrder = shuffle([...PARTY_IDS], random);
  const scoringCards = shuffle([...SCORING_CARD_IDS], random);
  const firstOpenerIndex = random.integer(configuration.seats.length);
  validateRandomInteger(firstOpenerIndex, configuration.seats.length);

  let firmIndex = 0;
  const seats = configuration.seats.map((seat, position): SeatState => {
    const firmIds = FIRM_IDS.slice(
      firmIndex,
      firmIndex + setup.firms
    ) as FirmId[];
    firmIndex += setup.firms;
    return {
      ...seat,
      position,
      firmIds,
      reserve: resourcesFromSetup(setup),
      scoringCardId: scoringCards[position]!
    };
  });

  const support = Object.fromEntries(
    DISTRICT_IDS.map((districtId) => [districtId, {}])
  ) as GameState["support"];
  for (const districtId of INITIAL_SUPPORT_DISTRICTS) {
    for (const partyId of PARTY_IDS) {
      support[districtId][partyId] = 1;
    }
  }

  const overtures = Object.fromEntries(
    PARTY_IDS.map((partyId) => [partyId, null])
  ) as GameState["overtures"];
  const firstOpener = seats[firstOpenerIndex]!;
  const state: GameState = {
    rulesetVersion: RULESET_VERSION,
    round: 1,
    electionNumber: 0,
    nextFirstOpenerSeatId: firstOpener.id,
    seats,
    partyOrder,
    support,
    overtures,
    reinforcedOverturePartyId: null,
    scoringDeck: scoringCards.slice(seats.length),
    contests: {},
    bids: {},
    counterbidSlots: Object.fromEntries(
      seats.map((seat) => [
        seat.id,
        Array.from({ length: setup.counterbidSlots }, () => null)
      ])
    ),
    chat: [],
    resolvedOperations: [],
    roundHistory: [],
    electionHistory: [],
    phase: {
      type: "opening",
      activeSeatId: firstOpener.id,
      submittedSeatIds: []
    },
    nextEntitySequence: 1,
    configuration: {
      counterbidTimerSeconds: configuration.counterbidTimerSeconds
    }
  };
  resetRoundTable(state);
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
  const phase = requirePhase(state, "election");
  if (phase.resultsRecorded) {
    throw new GameRuleError(
      "election_already_scored",
      "Election Day results are already recorded"
    );
  }
  const randomValues: number[] = [];
  scoreElectionDay({
    state: toOperationState(state),
    players: electionPlayers(state),
    random: () => {
      const value = random.integer(1_000_000);
      validateRandomInteger(value, 1_000_000);
      const normalized = value / 1_000_000;
      randomValues.push(normalized);
      return normalized;
    },
    finalElection: phase.afterRound === 12
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
  const next = structuredClone(state);
  next.roundHistory ??= [];
  next.electionHistory ??= [];
  if (next.phase.type === "complete") {
    throw new GameRuleError("game_complete", "The game is complete");
  }

  switch (action.type) {
    case "submit_openings":
      submitOpenings(next, action.seatId, action.openings, action.now);
      break;
    case "set_counterbid":
      setCounterbid(next, action.seatId, action.slotIndex, action.bid, action.now);
      break;
    case "set_counterbid_ready":
      setCounterbidReady(next, action.seatId, action.ready, action.now);
      break;
    case "expire_counterbids":
      expireCounterbids(next, action.now);
      break;
    case "resolve_pecking_swap":
      resolvePeckingSwap(
        next,
        action.seatId,
        action.decisionId,
        action.adjacentIndex
      );
      break;
    case "resolve_party_operation":
      resolvePartyOperation(
        next,
        action.seatId,
        action.decisionId,
        action.operation,
        action.choice
      );
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
    case "give_resources":
      giveResources(
        next,
        action.seatId,
        action.recipientSeatId,
        action.resources
      );
      break;
  }
  return next;
}

function submitOpenings(
  state: GameState,
  seatId: SeatId,
  openings: OpeningBidInput[],
  now: number
): void {
  const phase = requirePhase(state, "opening");
  if (phase.activeSeatId !== seatId) {
    throw new GameRuleError("not_active_seat", "It is another seat's opening turn");
  }
  const seat = getSeat(state, seatId);
  const setup = setupFor(state);
  const required = Math.min(setup.openingBidMarkers, seat.reserve.clout);
  if (openings.length !== required) {
    throw new GameRuleError(
      "wrong_opening_count",
      `This seat must open ${required} contest${required === 1 ? "" : "s"}`
    );
  }

  const firms = new Set<FirmId>();
  const parties = new Set<PartyId>();
  for (const opening of openings) {
    validateFirm(seat, opening.firmId);
    if (!(PARTY_IDS as readonly string[]).includes(opening.partyId)) {
      throw new GameRuleError("unknown_party", "Opening target party does not exist");
    }
    if (firms.has(opening.firmId)) {
      throw new GameRuleError("duplicate_firm", "A firm can open only one contest");
    }
    if (parties.has(opening.partyId) || state.contests[opening.partyId] !== undefined) {
      throw new GameRuleError("party_already_open", "Each party can host only one contest");
    }
    validatePackage(opening, false);
    firms.add(opening.firmId);
    parties.add(opening.partyId);
  }
  validateCombinedResources(seat.reserve, openings);

  for (const opening of openings) {
    subtractPackage(seat.reserve, opening);
    const bid = createBid(state, {
      contestId: opening.partyId,
      ownerSeatId: seat.id,
      firmId: opening.firmId,
      kind: "opening",
      slotIndex: null,
      clout: opening.clout,
      operations: opening.operations
    });
    state.contests[opening.partyId] = {
      id: opening.partyId,
      targetPartyId: opening.partyId,
      openingBidId: bid.id,
      bidIds: [bid.id]
    };
  }

  phase.submittedSeatIds.push(seatId);
  if (phase.submittedSeatIds.length === state.seats.length) {
    state.phase = {
      type: "counterbidding",
      deadlineAt:
        state.configuration.counterbidTimerSeconds === null
          ? null
          : now + state.configuration.counterbidTimerSeconds * 1_000,
      readySeatIds: []
    };
    return;
  }
  phase.activeSeatId = nextSeatId(state, seatId);
}

function setCounterbid(
  state: GameState,
  seatId: SeatId,
  slotIndex: number,
  input: CounterbidInput | null,
  now: number
): void {
  const phase = requirePhase(state, "counterbidding");
  requireCounterbidTime(phase, now);
  if (phase.readySeatIds.includes(seatId)) {
    throw new GameRuleError("seat_ready", "Unready before changing a counterbid");
  }
  const seat = getSeat(state, seatId);
  const slots = state.counterbidSlots[seatId]!;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
    throw new GameRuleError("invalid_slot", "Counterbid slot does not exist");
  }

  const existingId = slots[slotIndex]!;
  if (existingId !== null) {
    const existing = state.bids[existingId]!;
    addPackage(seat.reserve, existing);
    const contest = getContest(state, existing.contestId);
    contest.bidIds = contest.bidIds.filter((bidId) => bidId !== existingId);
    delete state.bids[existingId];
    slots[slotIndex] = null;
  }
  if (input === null) {
    return;
  }

  validateFirm(seat, input.firmId);
  const slotFirm = seat.firmIds[Math.floor(slotIndex / 2)];
  if (input.firmId !== slotFirm) {
    throw new GameRuleError(
      "wrong_counterbid_cover",
      "Counterbid slot must use its firm's cover"
    );
  }
  validatePackage(input, true);
  const contest = getContest(state, input.contestId);
  ensureAvailable(seat.reserve, input);
  subtractPackage(seat.reserve, input);
  const bid = createBid(state, {
    ...input,
    ownerSeatId: seatId,
    kind: "counterbid",
    slotIndex
  });
  contest.bidIds.push(bid.id);
  slots[slotIndex] = bid.id;
}

function setCounterbidReady(
  state: GameState,
  seatId: SeatId,
  ready: boolean,
  now: number
): void {
  const phase = requirePhase(state, "counterbidding");
  requireCounterbidTime(phase, now);
  if (typeof ready !== "boolean") {
    throw new GameRuleError("invalid_ready", "Ready state must be boolean");
  }
  getSeat(state, seatId);
  phase.readySeatIds = phase.readySeatIds.filter((id) => id !== seatId);
  if (ready) {
    phase.readySeatIds.push(seatId);
  }
  if (phase.readySeatIds.length === state.seats.length) {
    beginResolution(state);
  }
}

function expireCounterbids(state: GameState, now: number): void {
  const phase = requirePhase(state, "counterbidding");
  if (phase.deadlineAt === null) {
    throw new GameRuleError("timer_disabled", "This game has no counterbid timer");
  }
  if (now < phase.deadlineAt) {
    throw new GameRuleError("timer_running", "The counterbid deadline has not passed");
  }
  beginResolution(state);
}

function requireCounterbidTime(
  phase: Extract<GameState["phase"], { type: "counterbidding" }>,
  now: number
): void {
  if (!Number.isFinite(now)) {
    throw new GameRuleError("invalid_time", "Counterbid action time is invalid");
  }
  if (phase.deadlineAt !== null && now >= phase.deadlineAt) {
    throw new GameRuleError(
      "counterbid_deadline_passed",
      "The counterbid deadline has passed"
    );
  }
}

function beginResolution(state: GameState): void {
  cancelTiedCounterbids(state);
  const contestOrder: ContestId[] = [
    "pecking-order",
    ...state.partyOrder.filter(
      (partyId) => state.contests[partyId] !== undefined
    )
  ];
  state.phase = {
    type: "resolution",
    contestOrder,
    contestIndex: 0,
    contestPrepared: false,
    executionBidIds: [],
    bidIndex: 0,
    remainingOperations: {},
    pendingDecision: null,
    claimedBonuses: [],
    delayedBonusClaims: [],
    delayedClaimIndex: 0
  };
  advanceResolution(state);
}

function resolvePeckingSwap(
  state: GameState,
  seatId: SeatId,
  decisionId: string,
  adjacentIndex: number
): void {
  const phase = requireResolutionDecision(state, seatId, decisionId);
  const decision = phase.pendingDecision;
  if (
    decision === null ||
    decision.kind !== "pecking_swap" ||
    !decision.adjacentIndexes.includes(adjacentIndex)
  ) {
    throw new GameRuleError("illegal_decision", "That Pecking Order swap is not legal");
  }

  const left = state.partyOrder[adjacentIndex]!;
  state.partyOrder[adjacentIndex] = state.partyOrder[adjacentIndex + 1]!;
  state.partyOrder[adjacentIndex + 1] = left;
  const operation = takeFirstOperation(
    phase.remainingOperations[decision.bidId]!
  );
  state.resolvedOperations.push({
    round: state.round,
    contestId: decision.contestId,
    bidId: decision.bidId,
    operation,
    choice: { adjacentIndex }
  });
  phase.pendingDecision = null;
  advanceResolution(state);
}

function resolvePartyOperation(
  state: GameState,
  seatId: SeatId,
  decisionId: string,
  operation: OperationId,
  choice: unknown
): void {
  const phase = requireResolutionDecision(state, seatId, decisionId);
  const decision = phase.pendingDecision;
  if (decision?.kind === "night_delayed_operation") {
    if (operation !== decision.operation) {
      throw new GameRuleError("illegal_decision", "That delayed operation is not available");
    }
    const operationChoice = parseOperationChoice(choice, operation);
    const claim = phase.delayedBonusClaims[phase.delayedClaimIndex];
    if (claim === undefined || claim.id !== decision.claimId) {
      throw new GameRuleError("stale_decision", "Delayed bonus decision is stale");
    }
    const result = resolveNightDelayedOperations(
      toOperationState(state),
      [toNightClaim(claim)],
      { [claim.id]: operationChoice }
    );
    applyOperationState(state, result.state);
    state.resolvedOperations.push({
      round: state.round,
      contestId: decision.contestId,
      bidId: decision.bidId,
      operation,
      choice,
      baselineApplied: result.resolutions[0]?.applied ?? false,
      bonusApplied: true,
      failure: result.resolutions[0]?.failure ?? null
    });
    phase.delayedClaimIndex += 1;
    phase.pendingDecision = null;
    advanceResolution(state);
    return;
  }
  if (
    decision === null ||
    decision.kind !== "party_operation" ||
    !decision.legalOperations.includes(operation)
  ) {
    throw new GameRuleError("illegal_decision", "That operation is not available");
  }
  const request = parseOperationRequest(choice, decision.partyId, operation);
  if (
    request.claimBonus === true &&
    !(PARTIES_BY_ID[decision.partyId].favoredOperations as readonly OperationId[]).includes(
      operation
    )
  ) {
    throw new GameRuleError(
      "bonus_unavailable",
      "This party has no bonus for that operation"
    );
  }
  if (request.claimBonus === true && phase.claimedBonuses.includes(operation)) {
    throw new GameRuleError("bonus_unavailable", "That party bonus is already claimed");
  }
  if (
    request.claimBonus === true &&
    decision.partyId === "night-parliament" &&
    (operation === "rally" || operation === "court")
  ) {
    const ranked = rankedActiveBids(state, getContest(state, decision.contestId));
    request.nightClaim = {
      id: nextEntityId(state, "delayed"),
      ownerId: seatId,
      bidRank: ranked.findIndex((bid) => bid.id === decision.bidId),
      order: phase.delayedBonusClaims.length
    };
  }
  const result = resolveOperation(toOperationState(state), request);
  if (
    request.claimBonus === true &&
    result.baselineApplied === false &&
    result.bonusFailure !== null
  ) {
    throw new GameRuleError(
      "illegal_bonus_claim",
      result.bonusFailure ?? "The claimed bonus cannot resolve"
    );
  }
  applyOperationState(state, result.state);
  phase.remainingOperations[decision.bidId]![operation] -= 1;
  if (result.bonusApplied || result.delayedClaim !== null) {
    phase.claimedBonuses.push(operation);
  }
  if (result.delayedClaim !== null) {
    phase.delayedBonusClaims.push({
      ...result.delayedClaim,
      bidId: decision.bidId
    });
  }
  state.resolvedOperations.push({
    round: state.round,
    contestId: decision.contestId,
    bidId: decision.bidId,
    operation,
    choice,
    baselineApplied: result.baselineApplied,
    bonusApplied: result.bonusApplied || result.delayedClaim !== null,
    failure: result.failure ?? result.bonusFailure
  });
  phase.pendingDecision = null;
  advanceResolution(state);
}

function advanceResolution(state: GameState): void {
  const phase = requirePhase(state, "resolution");
  while (phase.pendingDecision === null) {
    if (phase.contestIndex >= phase.contestOrder.length) {
      finishRound(state);
      return;
    }
    const contestId = phase.contestOrder[phase.contestIndex]!;
    const contest = getContest(state, contestId);
    if (!phase.contestPrepared) {
      prepareContest(state, phase, contest);
    }
    if (phase.bidIndex >= phase.executionBidIds.length) {
      if (
        contestId === "night-parliament" &&
        phase.delayedClaimIndex < phase.delayedBonusClaims.length
      ) {
        phase.delayedBonusClaims.sort(
          (left, right) =>
            left.bidRank - right.bidRank || left.order - right.order
        );
        const claim = phase.delayedBonusClaims[phase.delayedClaimIndex]!;
        phase.pendingDecision = {
          id: nextEntityId(state, "decision"),
          kind: "night_delayed_operation",
          seatId: claim.ownerId,
          contestId,
          bidId: claim.bidId,
          claimId: claim.id,
          operation: claim.operation
        };
        continue;
      }
      transferContestBids(state, contest);
      phase.contestIndex += 1;
      phase.contestPrepared = false;
      phase.executionBidIds = [];
      phase.bidIndex = 0;
      phase.remainingOperations = {};
      phase.claimedBonuses = [];
      phase.delayedBonusClaims = [];
      phase.delayedClaimIndex = 0;
      continue;
    }

    const bidId = phase.executionBidIds[phase.bidIndex]!;
    const bid = state.bids[bidId]!;
    const remaining = phase.remainingOperations[bidId]!;
    if (operationCount(remaining) === 0) {
      phase.bidIndex += 1;
      continue;
    }

    phase.pendingDecision =
      contestId === "pecking-order"
        ? {
            id: nextEntityId(state, "decision"),
            kind: "pecking_swap",
            seatId: bid.ownerSeatId,
            contestId,
            bidId,
            adjacentIndexes: [0, 1, 2, 3, 4]
          }
        : {
            id: nextEntityId(state, "decision"),
            kind: "party_operation",
            seatId: bid.ownerSeatId,
            contestId,
            partyId: contestId,
            bidId,
            legalOperations: OPERATION_IDS.filter(
              (operation) => remaining[operation] > 0
            )
          };
  }
}

function prepareContest(
  state: GameState,
  phase: ResolutionPhase,
  contest: ContestState
): void {
  const ranked = contest.bidIds
    .map((bidId) => state.bids[bidId]!)
    .filter((bid) => bid.status === "active")
    .sort((left, right) => right.clout - left.clout);
  if (contest.id === "pecking-order" && ranked[0] !== undefined) {
    state.nextFirstOpenerSeatId = ranked[0].ownerSeatId;
  }
  const execution =
    contest.id === "pecking-order" ? [...ranked].reverse() : ranked;
  phase.executionBidIds = execution.map((bid) => bid.id);
  phase.bidIndex = 0;
  phase.remainingOperations = Object.fromEntries(
    ranked.map((bid) => [bid.id, cloneOperations(bid.operations)])
  );
  phase.contestPrepared = true;
  phase.claimedBonuses = [];
  phase.delayedBonusClaims = [];
  phase.delayedClaimIndex = 0;
}

function transferContestBids(state: GameState, contest: ContestState): void {
  const ranked = rankedActiveBids(state, contest);
  for (let index = 0; index < ranked.length; index += 1) {
    const bid = ranked[index]!;
    const recipient = ranked[(index + 1) % ranked.length]!;
    addPackage(getSeat(state, recipient.ownerSeatId).reserve, bid);
    bid.status = "transferred";
    bid.transferredToSeatId = recipient.ownerSeatId;
  }
}

function rankedActiveBids(
  state: GameState,
  contest: ContestState
): BidState[] {
  return contest.bidIds
    .map((bidId) => state.bids[bidId]!)
    .filter((bid) => bid.status === "active")
    .sort((left, right) => right.clout - left.clout);
}

function cancelTiedCounterbids(state: GameState): void {
  for (const contest of Object.values(state.contests)) {
    if (contest === undefined) {
      continue;
    }
    const opening =
      contest.openingBidId === null ? null : state.bids[contest.openingBidId]!;
    const counters = contest.bidIds
      .map((bidId) => state.bids[bidId]!)
      .filter((bid) => bid.kind === "counterbid");
    const counts = new Map<number, number>();
    for (const bid of counters) {
      counts.set(bid.clout, (counts.get(bid.clout) ?? 0) + 1);
    }
    for (const bid of counters) {
      if ((counts.get(bid.clout) ?? 0) > 1 || opening?.clout === bid.clout) {
        bid.status = "cancelled";
        addPackage(getSeat(state, bid.ownerSeatId).reserve, bid);
      }
    }
  }
}

function finishRound(state: GameState): void {
  const firstResolvedIndex = state.resolvedOperations.findIndex(
    (operation) => operation.round === state.round
  );
  state.roundHistory.push({
    round: state.round,
    partyOrder: [...state.partyOrder],
    contests: structuredClone(state.contests),
    bids: structuredClone(state.bids),
    resolvedOperations:
      firstResolvedIndex === -1
        ? []
        : structuredClone(state.resolvedOperations.slice(firstResolvedIndex))
  });
  if ((ELECTION_ROUNDS as readonly number[]).includes(state.round)) {
    const electionNumber = (state.electionNumber + 1) as 1 | 2 | 3;
    state.phase = {
      type: "election",
      electionNumber,
      afterRound: state.round as 4 | 8 | 12,
      resultsRecorded: false,
      readySeatIds: []
    };
    return;
  }
  beginRound(state, state.round + 1);
}

function completeElection(state: GameState, randomValues: number[]): void {
  const phase = requirePhase(state, "election");
  if (phase.resultsRecorded) {
    throw new GameRuleError(
      "election_already_scored",
      "Election Day results are already recorded"
    );
  }
  const scoringCards = state.seats.map((seat) => ({
    seatId: seat.id,
    scoringCardId: seat.scoringCardId
  }));
  let randomIndex = 0;
  const result = scoreElectionDay({
    state: toOperationState(state),
    players: electionPlayers(state),
    random: () => {
      const value = randomValues[randomIndex];
      randomIndex += 1;
      if (value === undefined) {
        throw new GameRuleError("invalid_election", "Recorded Election random values are incomplete");
      }
      return value;
    },
    finalElection: phase.afterRound === 12
  });
  if (randomIndex !== randomValues.length) {
    throw new GameRuleError("invalid_election", "Recorded Election random values contain unused entries");
  }
  for (const score of result.scores) {
    getSeat(state, score.playerId).reserve.points = score.resultingPoints;
  }
  state.electionHistory.push({
    electionNumber: phase.electionNumber,
    afterRound: phase.afterRound,
    scoringCards,
    draws: structuredClone(result.draws),
    scores: structuredClone(result.scores),
    winnerSeatIds: [...result.winnerIds]
  });
  state.electionNumber = phase.electionNumber;
  phase.resultsRecorded = true;
}

function setElectionReady(
  state: GameState,
  seatId: SeatId,
  ready: boolean
): void {
  const phase = requirePhase(state, "election");
  if (typeof ready !== "boolean") {
    throw new GameRuleError("invalid_ready", "Ready state must be boolean");
  }
  if (!phase.resultsRecorded) {
    throw new GameRuleError(
      "election_results_pending",
      "Election Day results are not ready"
    );
  }
  getSeat(state, seatId);
  phase.readySeatIds = phase.readySeatIds.filter((id) => id !== seatId);
  if (ready) {
    phase.readySeatIds.push(seatId);
  }
  if (phase.readySeatIds.length !== state.seats.length) {
    return;
  }
  if (phase.afterRound === 12) {
    const complete = completePhase(state);
    const finalElection = state.electionHistory.at(-1);
    if (finalElection?.afterRound === 12) {
      finalElection.winnerSeatIds = [...complete.winnerSeatIds];
    }
    state.phase = complete;
    return;
  }
  for (const seat of state.seats) {
    const card = state.scoringDeck.shift();
    if (card === undefined) {
      throw new GameRuleError("scoring_deck_empty", "The scoring deck cannot deal every seat");
    }
    seat.scoringCardId = card;
  }
  beginRound(state, state.round + 1);
}

function beginRound(state: GameState, round: number): void {
  state.round = round;
  resetRoundTable(state);
  state.phase = {
    type: "opening",
    activeSeatId: state.nextFirstOpenerSeatId,
    submittedSeatIds: []
  };
}

function resetRoundTable(state: GameState): void {
  state.contests = {
    "pecking-order": {
      id: "pecking-order",
      targetPartyId: null,
      openingBidId: null,
      bidIds: []
    }
  };
  state.bids = {};
  const slots = setupFor(state).counterbidSlots;
  state.counterbidSlots = Object.fromEntries(
    state.seats.map((seat) => [
      seat.id,
      Array.from({ length: slots }, () => null)
    ])
  );
}

function postChat(
  state: GameState,
  seatId: SeatId,
  rawText: string,
  now: number
): void {
  getSeat(state, seatId);
  const text = rawText.trim();
  if (text.length < 1 || text.length > 2_000) {
    throw new GameRuleError("invalid_chat", "Chat messages must contain 1 to 2000 characters");
  }
  state.chat.push({
    id: nextEntityId(state, "chat"),
    seatId,
    text,
    sentAt: now
  });
}

function giveResources(
  state: GameState,
  seatId: SeatId,
  recipientSeatId: SeatId,
  resources: ResourcePool
): void {
  if (seatId === recipientSeatId) {
    throw new GameRuleError("invalid_recipient", "A seat cannot give resources to itself");
  }
  const sender = getSeat(state, seatId);
  const recipient = getSeat(state, recipientSeatId);
  validatePackage(resources, true);
  if (!Number.isSafeInteger(resources.points) || resources.points < 0) {
    throw new GameRuleError("invalid_resources", "Gifted points must be non-negative");
  }
  if (resourceCount(resources) === 0) {
    throw new GameRuleError("empty_gift", "A gift must contain at least one resource");
  }
  ensureAvailable(sender.reserve, resources);
  if (sender.reserve.points < resources.points) {
    throw new GameRuleError("insufficient_points", "The sender does not have enough points");
  }
  subtractResources(sender.reserve, resources);
  addResources(recipient.reserve, resources);
}

function createBid(
  state: GameState,
  input: Omit<
    BidState,
    "id" | "status" | "transferredToSeatId"
  >
): BidState {
  const bid: BidState = {
    ...input,
    operations: cloneOperations(input.operations),
    id: nextEntityId(state, "bid"),
    status: "active",
    transferredToSeatId: null
  };
  state.bids[bid.id] = bid;
  return bid;
}

function completePhase(state: GameState): CompletePhase {
  const highest = Math.max(...state.seats.map((seat) => seat.reserve.points));
  return {
    type: "complete",
    winnerSeatIds: state.seats
      .filter((seat) => seat.reserve.points === highest)
      .map((seat) => seat.id)
  };
}

function toOperationState(state: GameState): OperationState {
  return {
    districts: Object.fromEntries(
      DISTRICTS.map((district) => [
        district.id,
        {
          id: district.id,
          capacity: district.capacity,
          neighbors: district.adjacentDistrictIds,
          support: { ...state.support[district.id] }
        }
      ])
    ),
    overtures: { ...state.overtures },
    oldShellReinforced: state.reinforcedOverturePartyId === "old-shell"
  };
}

function applyOperationState(state: GameState, operationState: OperationState): void {
  for (const districtId of DISTRICT_IDS) {
    state.support[districtId] = {
      ...(operationState.districts[districtId]?.support ?? {})
    };
  }
  state.overtures = { ...operationState.overtures };
  state.reinforcedOverturePartyId = operationState.oldShellReinforced
    ? "old-shell"
    : null;
}

function electionPlayers(state: GameState): ElectionPlayer[] {
  return state.seats.map((seat) => {
    const card = SCORING_CARDS_BY_ID[seat.scoringCardId];
    const scoringCard: ScoringCard = {
      id: card.id,
      objectives: card.objectives.map((objective) => ({
        districtId: objective.districtId,
        party: objective.partyId
      })),
      positiveSeat: card.gain,
      negativeSeat: card.lose
    };
    return {
      id: seat.id,
      position: seat.position,
      points: seat.reserve.points,
      card: scoringCard
    };
  });
}

function parseOperationRequest(
  value: unknown,
  party: PartyId,
  operation: OperationId
): OperationRequest {
  const object = isRecord(value) ? value : null;
  const nested = object !== null && "choice" in object;
  const choice = parseOperationChoice(nested ? object["choice"] : value, operation);
  const request: OperationRequest = { party, choice };
  if (nested && object["claimBonus"] !== undefined) {
    if (typeof object["claimBonus"] !== "boolean") {
      throw new GameRuleError("invalid_operation", "claimBonus must be boolean");
    }
    request.claimBonus = object["claimBonus"];
  }
  if (nested && object["repeatChoice"] !== undefined) {
    const repeat = parseOperationChoice(object["repeatChoice"], "organise");
    if (repeat.operation !== "organise") {
      throw new GameRuleError("invalid_operation", "Murmuration must repeat Organise");
    }
    request.repeatChoice = repeat;
  }
  return request;
}

function parseOperationChoice(
  value: unknown,
  operation: OperationId
): OperationChoice {
  if (!isRecord(value) || value["operation"] !== operation) {
    throw new GameRuleError(
      "invalid_operation",
      "Operation choice must match the selected operation"
    );
  }
  if (operation === "organise") {
    requireDistrictId(value["destinationDistrictId"], "destinationDistrictId");
    if (value["sourceDistrictId"] !== undefined) {
      requireDistrictId(value["sourceDistrictId"], "sourceDistrictId");
    }
  } else if (operation === "rally") {
    requireDistrictId(value["districtId"], "districtId");
  } else if (operation === "smear") {
    requireDistrictId(value["districtId"], "districtId");
    requirePartyId(value["rivalParty"], "rivalParty");
  } else {
    requirePartyId(value["targetParty"], "targetParty");
  }
  if (value["bonusDistrictId"] !== undefined) {
    requireDistrictId(value["bonusDistrictId"], "bonusDistrictId");
  }
  return value as unknown as OperationChoice;
}

function requireDistrictId(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !(DISTRICT_IDS as readonly string[]).includes(value)
  ) {
    throw new GameRuleError("invalid_operation", `${field} must be a district`);
  }
}

function requirePartyId(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !(PARTY_IDS as readonly string[]).includes(value)
  ) {
    throw new GameRuleError("invalid_operation", `${field} must be a party`);
  }
}

function toNightClaim(claim: {
  id: string;
  ownerId: string;
  bidRank: number;
  order: number;
  operation: "rally" | "court";
}): NightDelayedClaim {
  return {
    id: claim.id,
    ownerId: claim.ownerId,
    bidRank: claim.bidRank,
    order: claim.order,
    operation: claim.operation
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setupFor(state: GameState): PlayerSetup {
  return state.seats.length <= 3 ? DOUBLED_PLAYER_SETUP : STANDARD_PLAYER_SETUP;
}

function getSeat(state: GameState, seatId: SeatId): SeatState {
  const seat = state.seats.find((candidate) => candidate.id === seatId);
  if (seat === undefined) {
    throw new GameRuleError("unknown_seat", "Seat does not exist");
  }
  return seat;
}

function getContest(state: GameState, contestId: ContestId): ContestState {
  const contest = state.contests[contestId];
  if (contest === undefined) {
    throw new GameRuleError("unknown_contest", "Contest does not exist");
  }
  return contest;
}

function requirePhase<Type extends GameState["phase"]["type"]>(
  state: GameState,
  type: Type
): Extract<GameState["phase"], { type: Type }> {
  if (state.phase.type !== type) {
    throw new GameRuleError("wrong_phase", `Action requires the ${type} phase`);
  }
  return state.phase as Extract<GameState["phase"], { type: Type }>;
}

function requireResolutionDecision(
  state: GameState,
  seatId: SeatId,
  decisionId: string
): ResolutionPhase {
  const phase = requirePhase(state, "resolution");
  if (
    phase.pendingDecision === null ||
    phase.pendingDecision.id !== decisionId ||
    phase.pendingDecision.seatId !== seatId
  ) {
    throw new GameRuleError("stale_decision", "Decision is stale or belongs to another seat");
  }
  return phase;
}

function validateConfiguration(configuration: GameConfiguration): void {
  if (configuration.seats.length < 2 || configuration.seats.length > 6) {
    throw new GameRuleError("invalid_player_count", "Games require two to six seats");
  }
  const ids = new Set<string>();
  for (const seat of configuration.seats) {
    if (seat.id.length === 0 || ids.has(seat.id)) {
      throw new GameRuleError("invalid_seat", "Seat IDs must be non-empty and unique");
    }
    if (seat.displayName.trim().length === 0 || seat.displayName.length > 40) {
      throw new GameRuleError("invalid_seat", "Display names must contain 1 to 40 characters");
    }
    ids.add(seat.id);
  }
  const timer = configuration.counterbidTimerSeconds;
  if (timer !== null && (!Number.isSafeInteger(timer) || timer < 1)) {
    throw new GameRuleError("invalid_timer", "Timer must be null or a positive integer");
  }
}

function validateFirm(seat: SeatState, firmId: FirmId): void {
  if (!seat.firmIds.includes(firmId)) {
    throw new GameRuleError("wrong_firm", "The seat does not control that firm");
  }
}

function validatePackage(
  value: Pick<BidPackage, "clout" | "operations">,
  allowEmpty: boolean
): void {
  if (!Number.isSafeInteger(value.clout) || value.clout < (allowEmpty ? 0 : 1)) {
    throw new GameRuleError("invalid_clout", allowEmpty ? "Clout must be non-negative" : "Opening bids require Clout");
  }
  for (const operation of OPERATION_IDS) {
    const count = value.operations[operation];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new GameRuleError("invalid_operations", "Operation counts must be non-negative integers");
    }
  }
}

function validateCombinedResources(
  reserve: ResourcePool,
  openings: readonly OpeningBidInput[]
): void {
  const combined = emptyOperations();
  let clout = 0;
  for (const opening of openings) {
    clout += opening.clout;
    for (const operation of OPERATION_IDS) {
      combined[operation] += opening.operations[operation];
    }
  }
  ensureAvailable(reserve, { clout, operations: combined });
}

function ensureAvailable(
  reserve: ResourcePool,
  value: Pick<BidPackage, "clout" | "operations">
): void {
  if (
    reserve.clout < value.clout ||
    OPERATION_IDS.some(
      (operation) => reserve.operations[operation] < value.operations[operation]
    )
  ) {
    throw new GameRuleError("insufficient_resources", "Resources are already committed or unavailable");
  }
}

function subtractPackage(
  reserve: ResourcePool,
  value: Pick<BidPackage, "clout" | "operations">
): void {
  reserve.clout -= value.clout;
  for (const operation of OPERATION_IDS) {
    reserve.operations[operation] -= value.operations[operation];
  }
}

function addPackage(
  reserve: ResourcePool,
  value: Pick<BidPackage, "clout" | "operations">
): void {
  reserve.clout += value.clout;
  for (const operation of OPERATION_IDS) {
    reserve.operations[operation] += value.operations[operation];
  }
}

function subtractResources(reserve: ResourcePool, value: ResourcePool): void {
  subtractPackage(reserve, value);
  reserve.points -= value.points;
}

function addResources(reserve: ResourcePool, value: ResourcePool): void {
  addPackage(reserve, value);
  reserve.points += value.points;
}

function resourceCount(resources: ResourcePool): number {
  return (
    resources.clout +
    resources.points +
    OPERATION_IDS.reduce(
      (total, operation) => total + resources.operations[operation],
      0
    )
  );
}

function operationCount(operations: OperationInventory): number {
  return OPERATION_IDS.reduce(
    (total, operation) => total + operations[operation],
    0
  );
}

function takeFirstOperation(operations: OperationInventory): OperationId {
  const operation = OPERATION_IDS.find((candidate) => operations[candidate] > 0);
  if (operation === undefined) {
    throw new GameRuleError("no_operation", "The bid has no remaining operation");
  }
  operations[operation] -= 1;
  return operation;
}

function resourcesFromSetup(setup: PlayerSetup): ResourcePool {
  return {
    clout: setup.clout,
    operations: cloneOperations(setup.operations),
    points: setup.points
  };
}

function cloneOperations(
  operations: Readonly<Record<OperationId, number>>
): OperationInventory {
  return {
    organise: operations.organise,
    rally: operations.rally,
    smear: operations.smear,
    court: operations.court
  };
}

function emptyOperations(): OperationInventory {
  return { organise: 0, rally: 0, smear: 0, court: 0 };
}

function nextSeatId(state: GameState, seatId: SeatId): SeatId {
  const index = state.seats.findIndex((seat) => seat.id === seatId);
  return state.seats[(index + 1) % state.seats.length]!.id;
}

function nextEntityId(state: GameState, prefix: string): string {
  const id = `${prefix}-${state.nextEntitySequence}`;
  state.nextEntitySequence += 1;
  return id;
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
    throw new GameRuleError(
      "invalid_random_source",
      `Random source must return an integer from 0 to ${maxExclusive - 1}`
    );
  }
}
