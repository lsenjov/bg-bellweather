import {
  PARTY_IDS,
  RULESET_VERSION,
  SCORING_CARD_IDS,
  SCORING_CARDS_BY_ID,
  SCORING_CARD_PAIRS,
  type PartyId,
  type ScoringCardId
} from "@bellweather/content";
import { describe, expect, it } from "vitest";
import {
  createElectionAction,
  dealScoringCards,
  executeAction,
  initializeGame,
  openingTurnSeatIds,
  replay,
  type GameAction,
  type GameConfiguration,
  type GameEvent,
  type GameState,
  type OperationPlayInput
} from "../src/index.js";
import { projectGameState } from "../src/projection.js";

const zeroRandom = { integer: () => 0 };

describe("ruleset 17 setup", () => {
  for (const playerCount of [2, 3, 4, 5, 6]) {
    it(`creates the yearly Operation economy for ${playerCount} players`, () => {
      const state = initializeGame(configuration(playerCount), zeroRandom).state;
      const doubled = playerCount <= 3;
      expect(state.rulesetVersion).toBe(RULESET_VERSION);
      expect(state.year).toBe(1);
      expect(state.seats).toHaveLength(playerCount);
      expect(state.seats.every((seat) => seat.firmIds.length === (doubled ? 2 : 1))).toBe(true);
      expect(state.seats.every((seat) => seat.collectionCounters === (doubled ? 4 : 2))).toBe(true);
      expect(state.seats.every((seat) => seat.operations.organise === (doubled ? 4 : 2))).toBe(true);
      expect(state.seats.every((seat) => seat.operations.rally === (doubled ? 8 : 4))).toBe(true);
      expect(state.seats.every((seat) => seat.points === (doubled ? 10 : 5))).toBe(true);
      expect(state.phase.type).toBe("opening");
    });
  }

  it("deals registered pairs with the first card fixed as the Capital card", () => {
    const deck = SCORING_CARD_PAIRS.slice(0, 6).flat();
    const slots = dealScoringCards(deck, 2);
    expect(slots).toEqual([
      [SCORING_CARD_PAIRS[0], SCORING_CARD_PAIRS[2], SCORING_CARD_PAIRS[4]],
      [SCORING_CARD_PAIRS[1], SCORING_CARD_PAIRS[3], SCORING_CARD_PAIRS[5]]
    ]);
    expect(() => dealScoringCards(
      ["SC-01", "SC-03", ...SCORING_CARD_PAIRS.slice(2).flat()],
      2
    )).toThrow("registered pairs");
  });

  it("deals one card per Election at standard player counts", () => {
    const slots = dealScoringCards(SCORING_CARD_IDS, 4);
    expect(slots[0]).toEqual([["SC-01"], ["SC-05"], ["SC-09"]]);
    expect(slots[3]).toEqual([["SC-04"], ["SC-08"], ["SC-12"]]);
  });

  it("rejects old saved rulesets", () => {
    const initialized = initializeGame(configuration(4), zeroRandom);
    initialized.state.rulesetVersion = "15";
    expect(() => replay([initialized])).toThrow("Only ruleset 17 is supported");
  });
});

describe("party openings", () => {
  it("uses snake order only for two- and three-player openings", () => {
    const two = initializeGame(configuration(2), zeroRandom).state;
    const three = initializeGame(configuration(3), zeroRandom).state;
    const four = initializeGame(configuration(4), zeroRandom).state;
    expect(openingTurnSeatIds(two.seats, "seat-1")).toEqual([
      "seat-1", "seat-2", "seat-2", "seat-1"
    ]);
    expect(openingTurnSeatIds(three.seats, "seat-1")).toEqual([
      "seat-1", "seat-2", "seat-3", "seat-3", "seat-2", "seat-1"
    ]);
    expect(openingTurnSeatIds(four.seats, "seat-1")).toEqual([
      "seat-1", "seat-2", "seat-3", "seat-4"
    ]);
  });

  it("requires one unused firm and one unopened party per turn", () => {
    let state = initializeGame(configuration(2), zeroRandom).state;
    const phase = openingPhase(state);
    const first = state.seats.find((seat) => seat.id === phase.turnSeatIds[0])!;
    state = act(state, {
      type: "open_party",
      seatId: first.id,
      firmId: first.firmIds[0]!,
      partyId: "honeycomb"
    });
    const secondSeatId = openingPhase(state).turnSeatIds[openingPhase(state).turnIndex]!;
    const second = state.seats.find((seat) => seat.id === secondSeatId)!;
    expect(() => act(state, {
      type: "open_party",
      seatId: second.id,
      firmId: second.firmIds[0]!,
      partyId: "honeycomb"
    })).toThrow("already open");
    state = openAllParties(state);
    expect(state.phase).toMatchObject({ type: "lobby", activeSeatId: state.earlyBirdSeatId });
  });

  it("returns to ordinary clockwise human turns after low-player openings", () => {
    const state = openAllParties(initializeGame(configuration(2), zeroRandom).state);
    expect(state.phase).toMatchObject({
      type: "lobby",
      activeSeatId: "seat-1",
      turn: 1
    });
    const passed = act(state, { type: "pass", seatId: "seat-1" });
    expect(passed.phase).toMatchObject({ type: "lobby", activeSeatId: "seat-2" });
  });
});

describe("Lobby actions", () => {
  it("resolves up to three cards one at a time at one locked party", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const seatId = lobbyPhase(state).activeSeatId;
    const before = structuredClone(state);
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        operation: "organise",
        choice: {
          operation: "organise",
          sourceDistrictId: "harbormouth",
          destinationDistrictId: "cloverfield"
        },
        claimBonus: true
      }
    });
    expect(state.support.cloverfield.honeycomb).toBe(2);
    expect(lobbyPhase(state)).toMatchObject({
      activeSeatId: seatId,
      inProgressOperate: {
        partyId: "honeycomb",
        operationCount: 1,
        bonusClaimed: true
      }
    });
    expect(() => act(state, {
      type: "operate",
      seatId,
      partyId: "old-shell",
      play: {
        operation: "rally",
        choice: { operation: "rally", districtId: "harbormouth" }
      }
    })).toThrow("same party");
    expect(() => act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        operation: "court",
        choice: { operation: "court", targetParty: "foxglove" },
        claimBonus: true
      }
    })).toThrow("at most one bonus");

    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        operation: "rally",
        choice: { operation: "rally", districtId: "cloverfield" }
      }
    });
    expect(lobbyPhase(state).inProgressOperate?.operationCount).toBe(2);
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        operation: "court",
        choice: { operation: "court", targetParty: "old-shell" }
      }
    });
    expect(state.parties.honeycomb?.operations).toMatchObject({
      organise: 1,
      rally: 1,
      court: 1
    });
    expect(state.parties.honeycomb?.claimedBonuses).toEqual(["organise"]);
    expect(state.support.cloverfield.honeycomb).toBe(3);
    expect(state.resolvedOperations).toHaveLength(3);
    expect(before.support.cloverfield.honeycomb).toBeUndefined();
    expect(lobbyPhase(state).activeSeatId).not.toBe(seatId);
    expect(state.lobbyActions).toEqual([
      expect.objectContaining({ type: "operate", operationCount: 3, cardCount: 3 })
    ]);
  });

  it("keeps an earlier resolved card when a later choice is illegal", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const seatId = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: organise("harbormouth", "cloverfield")
    });
    expect(() => act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        operation: "smear",
        choice: {
          operation: "smear",
          districtId: "cloverfield",
          rivalParty: "honeycomb"
        }
      }
    })).toThrow("Smear requires rival Support");
    expect(state.support.cloverfield.honeycomb).toBe(1);
    expect(state.seats[0]!.operations.organise).toBe(1);
    expect(state.parties.honeycomb?.operations.organise).toBe(1);
    expect(() => act(state, { type: "pass", seatId })).toThrow("Finish the current Operate");
    state = act(state, { type: "finish_operate", seatId });
    expect(lobbyPhase(state).activeSeatId).not.toBe(seatId);
  });

  it("collects a complete non-empty pile into next year and leaves the party open", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const operator = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "operate",
      seatId: operator,
      partyId: "honeycomb",
      play: organise("harbormouth", "cloverfield")
    });
    state = act(state, { type: "finish_operate", seatId: operator });
    const collector = lobbyPhase(state).activeSeatId;
    state = act(state, { type: "collect", seatId: collector, partyId: "honeycomb" });
    const collectorSeat = state.seats.find((seat) => seat.id === collector)!;
    expect(collectorSeat.collectionCounters).toBe(1);
    expect(collectorSeat.newYearOperations.organise).toBe(1);
    expect(state.parties.honeycomb).toMatchObject({
      status: "open",
      operations: { organise: 0, rally: 0, smear: 0, court: 0 }
    });
    expect(() => act(state, {
      type: "collect",
      seatId: lobbyPhase(state).activeSeatId,
      partyId: "honeycomb"
    })).toThrow("non-empty");
  });

  it("forbids first-turn closure and lets a strict majority end mid-orbit", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    expect(() => act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1")
    })).toThrow("first Lobby turn");

    state = act(state, { type: "pass", seatId: "seat-1" });
    state = act(state, { type: "pass", seatId: "seat-2" });
    state = act(state, { type: "pass", seatId: "seat-3" });
    state = act(state, {
      type: "operate",
      seatId: "seat-4",
      partyId: partyOpenedBy(state, "seat-4"),
      play: organise("harbormouth", "cloverfield")
    });
    state = act(state, { type: "finish_operate", seatId: "seat-4" });
    state = act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1")
    });
    state = act(state, {
      type: "close",
      seatId: "seat-2",
      partyId: partyOpenedBy(state, "seat-2")
    });
    state = act(state, {
      type: "close",
      seatId: "seat-3",
      partyId: partyOpenedBy(state, "seat-3")
    });

    expect(state.year).toBe(2);
    expect(state.earlyBirdSeatId).toBe("seat-3");
    expect(state.phase.type).toBe("opening");
    expect(state.yearHistory[0]).toMatchObject({
      endReason: "majority_closed",
      endedBySeatId: "seat-3"
    });
    expect(state.seats[3]!.operations.organise).toBe(2);
  });

  it("awards all open parties and Early Bird to the final consecutive passer", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    for (const seatId of ["seat-1", "seat-2", "seat-3", "seat-4"]) {
      state = act(state, { type: "pass", seatId });
    }
    expect(state.year).toBe(2);
    expect(state.earlyBirdSeatId).toBe("seat-4");
    expect(state.yearHistory[0]).toMatchObject({
      endReason: "passes",
      endedBySeatId: "seat-4"
    });
    expect(Object.values(state.yearHistory[0]!.parties).every(
      (party) => party?.status === "closed"
    )).toBe(true);
  });
});

describe("cleanup, Elections, visibility, and replay", () => {
  it("cleans resources before Election scoring and records Capital points separately", () => {
    let state = initializeGame(configuration(4), zeroRandom).state;
    for (let year = 1; year <= 3; year += 1) {
      state = passThroughYear(state);
    }
    state = openAllParties(state);
    const capitalCardId = state.seats[0]!.scoringCardIds[0]![0]!;
    const capitalParties = state.seats[0]!.scoringCardIds[0]!.length === 1
      ? scoringParties(capitalCardId)
      : [];
    state.support["bellweather-centre"] = Object.fromEntries(
      capitalParties.map((partyId) => [partyId, 1])
    );
    state.courtSupport.honeycomb.foxglove = 2;

    const operator = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "operate",
      seatId: operator,
      partyId: partyOpenedBy(state, operator),
      play: organise("harbormouth", "cloverfield")
    });
    state = act(state, { type: "finish_operate", seatId: operator });
    const collector = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "collect",
      seatId: collector,
      partyId: partyOpenedBy(state, operator)
    });
    const collectorBefore = state.seats.find((seat) => seat.id === collector)!;
    expect(collectorBefore.newYearOperations.organise).toBe(1);
    const passers: string[] = [];
    while (state.phase.type === "lobby") {
      passers.push(state.phase.activeSeatId);
      state = act(state, { type: "pass", seatId: state.phase.activeSeatId });
    }
    expect(passers).toHaveLength(4);
    expect(state.phase).toMatchObject({ type: "election", resultsRecorded: false });
    const collectorAfter = state.seats.find((seat) => seat.id === collector)!;
    expect(collectorAfter.newYearOperations.organise).toBe(0);
    expect(collectorAfter.collectionCounters).toBe(2);
    expect(collectorAfter.operations.organise).toBe(3);
    expect(state.courtSupport.honeycomb.foxglove).toBe(2);
    expect(state.parties).toEqual({});

    state = act(state, createElectionAction(state, zeroRandom));
    expect(state.courtSupport.honeycomb).toEqual({});
    const seatScore = state.electionHistory[0]!.scores.find(
      (score) => score.playerId === "seat-1"
    )!;
    expect(seatScore.capitalMatches).toBe(3);
    expect(seatScore.capitalScore).toBe(3);
    for (const seat of state.seats) {
      state = act(state, { type: "set_election_ready", seatId: seat.id, ready: true });
    }
    expect(state.year).toBe(5);
    expect(state.phase.type).toBe("opening");
  });

  it("keeps hands and New Year contents private while publishing their counts", () => {
    const state = initializeGame(configuration(4), zeroRandom).state;
    state.seats[1]!.newYearOperations.rally = 2;
    const owner = projectGameState(state, "seat-2");
    const rival = projectGameState(state, "seat-1");
    expect(owner.seats[1]!.operations).not.toBeNull();
    expect(owner.seats[1]!.newYearOperations?.rally).toBe(2);
    expect(rival.seats[1]!.operations).toBeNull();
    expect(rival.seats[1]!.newYearOperations).toBeNull();
    expect(rival.seats[1]!.newYearCardCount).toBe(2);
    expect(rival.seats[1]!.scoringCardIds).toBeNull();
  });

  it("records chat and replays the new actions exactly", () => {
    const initialized = initializeGame(configuration(4), zeroRandom);
    const events: GameEvent[] = [initialized];
    let state = initialized.state;
    const phase = openingPhase(state);
    const seat = state.seats.find((candidate) => candidate.id === phase.turnSeatIds[0])!;
    for (const action of [
      {
        type: "post_chat",
        seatId: seat.id,
        text: "Close the room.",
        now: 123
      } as const,
      {
        type: "open_party",
        seatId: seat.id,
        firmId: seat.firmIds[0]!,
        partyId: "honeycomb"
      } as const
    ]) {
      const applied = executeAction(state, action);
      state = applied.state;
      events.push(...applied.events);
    }
    expect(replay(events)).toEqual(state);
    expect(state.chat[0]).toMatchObject({ text: "Close the room.", sentAt: 123 });
  });
});

function configuration(playerCount: number): GameConfiguration {
  return {
    seats: Array.from({ length: playerCount }, (_, index) => ({
      id: `seat-${index + 1}`,
      displayName: `Player ${index + 1}`,
      controller: "human" as const
    }))
  };
}

function act(state: GameState, action: GameAction): GameState {
  return executeAction(state, action).state;
}

function openAllParties(initial: GameState): GameState {
  let state = initial;
  while (state.phase.type === "opening") {
    const seatId = state.phase.turnSeatIds[state.phase.turnIndex]!;
    const seat = state.seats.find((candidate) => candidate.id === seatId)!;
    const usedFirms = new Set(
      Object.values(state.parties).flatMap((party) => party ? [party.firmId] : [])
    );
    const firmId = seat.firmIds.find((candidate) => !usedFirms.has(candidate))!;
    const partyId = PARTY_IDS.find((candidate) => state.parties[candidate] === undefined)!;
    state = act(state, { type: "open_party", seatId, firmId, partyId });
  }
  return state;
}

function passThroughYear(initial: GameState): GameState {
  let state = openAllParties(initial);
  while (state.phase.type === "lobby") {
    state = act(state, { type: "pass", seatId: state.phase.activeSeatId });
  }
  return state;
}

function openingPhase(state: GameState) {
  if (state.phase.type !== "opening") throw new Error("Expected opening phase");
  return state.phase;
}

function lobbyPhase(state: GameState) {
  if (state.phase.type !== "lobby") throw new Error("Expected Lobby phase");
  return state.phase;
}

function partyOpenedBy(state: GameState, seatId: string): PartyId {
  const party = Object.values(state.parties).find(
    (candidate) => candidate?.ownerSeatId === seatId && candidate.status === "open"
  );
  if (party === undefined) throw new Error(`No open party for ${seatId}`);
  return party.partyId;
}

function organise(sourceDistrictId: string, destinationDistrictId: string): OperationPlayInput {
  return {
    operation: "organise",
    choice: { operation: "organise", sourceDistrictId, destinationDistrictId }
  };
}

function scoringParties(cardId: ScoringCardId): PartyId[] {
  return SCORING_CARDS_BY_ID[cardId].objectives.map(
    (objective) => objective.partyId
  );
}
