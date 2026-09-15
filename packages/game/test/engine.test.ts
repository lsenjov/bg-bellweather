import {
  DISTRICT_IDS,
  DISTRICTS_BY_ID,
  ELECTION_YEARS,
  PARTY_IDS,
  RULESET_VERSION,
  SCORING_CARD_IDS,
  SCORING_CARDS_BY_ID,
  type BonusCardId,
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

describe("ruleset 25 setup", () => {
  for (const playerCount of [2, 3, 4, 5, 6]) {
    it(`creates the yearly Operation economy for ${playerCount} players`, () => {
      const state = initializeGame(configuration(playerCount), zeroRandom).state;
      const doubled = playerCount <= 3;
      expect(state.rulesetVersion).toBe(RULESET_VERSION);
      expect(state.year).toBe(1);
      expect(state.seats).toHaveLength(playerCount);
      expect(state.seats.every((seat) => seat.firmIds.length === (doubled ? 2 : 1))).toBe(true);
      expect(state.seats.every((seat) => seat.collectionCounters === (doubled ? 4 : 2))).toBe(true);
      expect(state.seats.every((seat) => seat.operations.organise === (doubled ? 6 : 3))).toBe(true);
      expect(state.seats.every((seat) => seat.operations.rally === (doubled ? 8 : 4))).toBe(true);
      expect(state.seats.every((seat) => seat.points === 0)).toBe(true);
      expect(state.phase.type).toBe("opening");
      expect(Object.values(state.bonusCards).every((location) => location.zone === "home")).toBe(true);
    });
  }

  it("rejects old saved rulesets", () => {
    const initialized = initializeGame(configuration(4), zeroRandom);
    initialized.state.rulesetVersion = "18";
    expect(() => replay([initialized])).toThrow("Only ruleset 25 is supported");
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
    const collected = act(state, {
      type: "collect",
      seatId: "seat-1",
      partyId: "honeycomb"
    });
    expect(collected.phase).toMatchObject({ type: "lobby", activeSeatId: "seat-2" });
    expect(collected.lobbyActions.at(-1)).toMatchObject({
      type: "collect",
      supportChanges: []
    });
  });
});

describe("Lobby actions", () => {
  it("resolves ordinary and Bonus cards within one locked three-card action", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const seatId = lobbyPhase(state).activeSeatId;
    state.bonusCards["honeycomb-waggle-route"] = { zone: "hand", seatId };
    const before = structuredClone(state);
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        cardType: "bonus",
        bonusCardId: "honeycomb-waggle-route",
        choice: {
          operation: "organise",
          sourceDistrictId: "grand-market",
          destinationDistrictId: "northgate"
        }
      }
    });
    expect(state.support["northgate"].honeycomb).toBe(2);
    expect(lobbyPhase(state)).toMatchObject({
      activeSeatId: seatId,
      inProgressOperate: {
        partyId: "honeycomb",
        operationCount: 0,
        cardCount: 1
      }
    });
    expect(state.bonusCards["honeycomb-waggle-route"]).toEqual({ zone: "home" });
    expect(() => act(state, {
      type: "operate",
      seatId,
      partyId: "old-shell",
      play: {
        cardType: "operation",
        operation: "rally",
        choice: { operation: "rally", districtId: "grand-market" }
      }
    })).toThrow("same party");

    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        cardType: "operation",
        operation: "rally",
        choice: { operation: "rally", districtId: "northgate" }
      }
    });
    expect(lobbyPhase(state).inProgressOperate).toMatchObject({
      operationCount: 1,
      cardCount: 2
    });
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        cardType: "operation",
        operation: "smear",
        choice: { operation: "smear", districtId: "grand-market", rivalParty: "old-shell" }
      }
    });
    expect(state.parties.honeycomb?.operations).toMatchObject({
      organise: 0,
      rally: 1,
      smear: 1
    });
    expect(state.support["northgate"].honeycomb).toBe(3);
    expect(state.resolvedOperations).toHaveLength(3);
    expect(before.support["northgate"].honeycomb).toBeUndefined();
    expect(lobbyPhase(state).activeSeatId).not.toBe(seatId);
    expect(state.lobbyActions).toEqual([expect.objectContaining({
      type: "operate",
      operationCount: 2,
      cardCount: 3,
      supportChanges: [
        {
          type: "move",
          partyId: "honeycomb",
          sourceDistrictId: "grand-market",
          destinationDistrictId: "northgate"
        },
        {
          type: "add",
          partyId: "honeycomb",
          destinationDistrictId: "northgate"
        },
        {
          type: "add",
          partyId: "honeycomb",
          destinationDistrictId: "northgate"
        },
        { type: "remove", partyId: "old-shell", sourceDistrictId: "grand-market" }
      ]
    })]);
    expect(projectGameState(state, null).lobbyActions.at(-1)?.supportChanges)
      .toEqual(state.lobbyActions.at(-1)?.supportChanges);
  });

  it("keeps an earlier resolved card when a later choice is illegal", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const seatId = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: organise("grand-market", "northgate")
    });
    expect(() => act(state, {
      type: "operate",
      seatId,
      partyId: "honeycomb",
      play: {
        cardType: "operation",
        operation: "smear",
        choice: {
          operation: "smear",
          districtId: "northgate",
          rivalParty: "honeycomb"
        }
      }
    })).toThrow("Smear requires rival Support");
    expect(state.support["northgate"].honeycomb).toBe(1);
    expect(state.seats[0]!.operations.organise).toBe(2);
    expect(state.parties.honeycomb?.operations.organise).toBe(1);
    expect(() => act(state, { type: "pass", seatId })).toThrow("Finish the current Operate");
    state = act(state, { type: "finish_operate", seatId });
    expect(lobbyPhase(state).activeSeatId).not.toBe(seatId);
  });

  it("resolves the three district-based Unbound cards", () => {
    let beeState = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    clearSupport(beeState);
    beeState.support.orchard.honeycomb = 1;
    beeState.support.coast = { honeycomb: 1, "old-shell": 3 };
    beeState.support.harbormouth.honeycomb = 2;
    beeState = playUnbound(
      beeState,
      "honeycomb",
      "honeycomb-every-bee-counts",
      { effect: "every_bee_counts" }
    );
    expect(beeState.support.orchard.honeycomb).toBe(2);
    expect(beeState.support.coast.honeycomb).toBe(1);
    expect(beeState.support.harbormouth.honeycomb).toBe(2);
    expect(beeState.resolvedOperations.at(-1)).toMatchObject({
      operation: null,
      bonusCardReturnedHome: true
    });

    let transitState = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    clearSupport(transitState);
    transitState.support.orchard.honeycomb = 1;
    transitState.support["crown-road"]["old-shell"] = 1;
    transitState.support["canal-ward"].foxglove = 1;
    transitState = playUnbound(
      transitState,
      "riverworks",
      "riverworks-mass-transit",
      {
        effect: "mass_transit",
        districtIds: ["orchard", "crown-road", "canal-ward", "northgate"],
        supportPartyIds: ["honeycomb", "old-shell", "foxglove"]
      }
    );
    expect(transitState.support.orchard).toEqual({});
    expect(transitState.support["crown-road"]).toEqual({ honeycomb: 1 });
    expect(transitState.support["canal-ward"]).toEqual({ "old-shell": 1 });
    expect(transitState.support["northgate"]).toEqual({ foxglove: 1 });
    expect(lobbyPhase(transitState).inProgressOperate?.supportChanges).toEqual([
      {
        type: "move",
        partyId: "honeycomb",
        sourceDistrictId: "orchard",
        destinationDistrictId: "crown-road"
      },
      {
        type: "move",
        partyId: "old-shell",
        sourceDistrictId: "crown-road",
        destinationDistrictId: "canal-ward"
      },
      {
        type: "move",
        partyId: "foxglove",
        sourceDistrictId: "canal-ward",
        destinationDistrictId: "northgate"
      }
    ]);

    let nestState = openAllParties(initializeGame(configuration(6), zeroRandom).state);
    clearSupport(nestState);
    nestState.support.harbormouth["many-wings"] = 2;
    nestState.support["grand-market"]["many-wings"] = 3;
    nestState = playUnbound(
      nestState,
      "many-wings",
      "many-wings-empty-every-nest",
      {
        effect: "empty_every_nest",
        sourceDistrictIds: ["harbormouth", "grand-market"],
        destinationDistrictIds: ["orchard", "meadow"]
      }
    );
    expect(nestState.support.harbormouth["many-wings"]).toBe(1);
    expect(nestState.support["grand-market"]["many-wings"]).toBe(2);
    expect(nestState.support.orchard["many-wings"]).toBe(1);
    expect(nestState.support.meadow["many-wings"]).toBe(1);
    expect(lobbyPhase(nestState).inProgressOperate?.supportChanges).toEqual([
      {
        type: "move",
        partyId: "many-wings",
        sourceDistrictId: "harbormouth",
        destinationDistrictId: "orchard"
      },
      {
        type: "move",
        partyId: "many-wings",
        sourceDistrictId: "grand-market",
        destinationDistrictId: "meadow"
      }
    ]);
  });

  it("moves the maximum feasible nests and lets the player choose sources when space is scarce", () => {
    const state = openAllParties(initializeGame(configuration(6), zeroRandom).state);
    for (const id of DISTRICT_IDS) state.support[id] = { honeycomb: DISTRICTS_BY_ID[id].capacity };
    state.support.harbormouth = { "many-wings": 2 };
    state.support["grand-market"] = { "many-wings": 2 };
    state.support.orchard = {};
    const choice = { effect: "empty_every_nest", sourceDistrictIds: ["grand-market"], destinationDistrictIds: ["orchard"] };
    const result = playUnbound(structuredClone(state), "many-wings", "many-wings-empty-every-nest", choice);
    expect(result.support.harbormouth["many-wings"]).toBe(2);
    expect(result.support["grand-market"]["many-wings"]).toBe(1);
    expect(result.support.orchard["many-wings"]).toBe(1);
    state.support.meadow = {};
    expect(() => playUnbound(structuredClone(state), "many-wings", "many-wings-empty-every-nest", choice)).toThrow("maximum");
    expect(() => playUnbound(structuredClone(state), "many-wings", "many-wings-empty-every-nest",
      { ...choice, sourceDistrictIds: ["grand-market", "grand-market"], destinationDistrictIds: ["orchard", "meadow"] })).toThrow("maximum");
  });

  it("moves another player's Firm and pile with Shell Firm, then ends the action", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    state.parties["old-shell"]!.status = "closed";
    const source = state.parties.foxglove!;
    source.operations.organise = 2;
    const firmId = source.firmId;
    const ownerSeatId = source.ownerSeatId;

    state = playUnbound(
      state,
      "foxglove",
      "foxglove-shell-firm",
      { effect: "shell_firm", targetPartyId: "old-shell" }
    );

    expect(state.parties.foxglove).toMatchObject({
      status: "closed",
      operations: { organise: 0 }
    });
    expect(state.parties["old-shell"]).toMatchObject({
      status: "open",
      firmId,
      ownerSeatId,
      operations: { organise: 2 }
    });
    expect(lobbyPhase(state)).toMatchObject({
      activeSeatId: "seat-2",
      inProgressOperate: null
    });
    expect(state.lobbyActions.at(-1)).toMatchObject({
      type: "operate",
      partyId: "foxglove",
      cardCount: 1
    });
  });

  it("collects complete piles, including empty piles, and leaves the party open", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    const operator = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "operate",
      seatId: operator,
      partyId: "honeycomb",
      play: organise("grand-market", "northgate")
    });
    state = act(state, { type: "finish_operate", seatId: operator });
    const collector = lobbyPhase(state).activeSeatId;
    state = act(state, {
      type: "collect",
      seatId: collector,
      partyId: "honeycomb",
      bonusCardId: "honeycomb-waggle-route"
    });
    const collectorSeat = state.seats.find((seat) => seat.id === collector)!;
    expect(collectorSeat.collectionCounters).toBe(1);
    expect(collectorSeat.newYearOperations.organise).toBe(1);
    expect(state.bonusCards["honeycomb-waggle-route"]).toEqual({
      zone: "new_year",
      seatId: collector
    });
    expect(state.parties.honeycomb).toMatchObject({
      status: "open",
      operations: { organise: 0, rally: 0, smear: 0 }
    });
    const emptyCollectorId = lobbyPhase(state).activeSeatId;
    const emptyCollectorBefore = state.seats.find(
      (seat) => seat.id === emptyCollectorId
    )!.collectionCounters;
    state = act(state, {
      type: "collect",
      seatId: emptyCollectorId,
      partyId: "honeycomb"
    });
    expect(state.seats.find((seat) => seat.id === emptyCollectorId)!.collectionCounters)
      .toBe(emptyCollectorBefore - 1);
    expect(state.parties.honeycomb?.status).toBe("open");
  });

  it("forbids first-turn closure and lets a strict majority end mid-orbit", () => {
    let state = openAllParties(initializeGame(configuration(4), zeroRandom).state);
    expect(() => act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1")
    })).toThrow("first Lobby turn");

    state = act(state, { type: "collect", seatId: "seat-1", partyId: "honeycomb" });
    state = act(state, { type: "collect", seatId: "seat-2", partyId: "honeycomb" });
    state = act(state, { type: "collect", seatId: "seat-3", partyId: "honeycomb" });
    state = act(state, {
      type: "operate",
      seatId: "seat-4",
      partyId: partyOpenedBy(state, "seat-4"),
      play: organise("grand-market", "northgate")
    });
    state = act(state, { type: "finish_operate", seatId: "seat-4" });
    state = act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1"),
      bonusCardId: "honeycomb-common-cause"
    });
    expect(state.bonusCards["honeycomb-common-cause"]).toEqual({
      zone: "new_year",
      seatId: "seat-1"
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

    expect(state.phase).toMatchObject({
      type: "closure",
      pendingPartyIds: [partyOpenedByAnyStatus(state, "seat-4")]
    });
    state = resolveClosure(state);
    expect(state.year).toBe(2);
    expect(state.earlyBirdSeatId).toBe("seat-3");
    expect(state.phase.type).toBe("opening");
    expect(state.yearHistory[0]).toMatchObject({
      endedBySeatId: "seat-3"
    });
    expect(state.seats[3]!.operations.organise).toBe(3);
  });

  it("allows Pass only after all of the player's Firm markers return", () => {
    let state = openAllParties(initializeGame(configuration(2), zeroRandom).state);
    expect(() => act(state, { type: "pass", seatId: "seat-1" }))
      .toThrow("Firm markers to have returned");

    state = act(state, { type: "collect", seatId: "seat-1", partyId: "honeycomb" });
    state = act(state, { type: "collect", seatId: "seat-2", partyId: "honeycomb" });
    state = act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1")
    });
    state = act(state, { type: "collect", seatId: "seat-2", partyId: firstOpenParty(state) });
    expect(() => act(state, { type: "pass", seatId: "seat-1" }))
      .toThrow("Firm markers to have returned");
    state = act(state, {
      type: "close",
      seatId: "seat-1",
      partyId: partyOpenedBy(state, "seat-1")
    });
    state = act(state, { type: "collect", seatId: "seat-2", partyId: firstOpenParty(state) });
    state = act(state, { type: "pass", seatId: "seat-1" });

    expect(state.phase).toMatchObject({
      type: "lobby",
      activeSeatId: "seat-2"
    });
    expect(() => act(state, { type: "pass", seatId: "seat-2" }))
      .toThrow("Firm markers to have returned");
  });
});

describe("cleanup, Elections, visibility, and replay", () => {

  it("holds three Elections after two-year cycles and completes after Year 6", () => {
    let state = initializeGame(configuration(4), zeroRandom).state;
    let finalReplayEvents: GameEvent[] | null = null;

    for (const [index, afterYear] of ELECTION_YEARS.entries()) {
      while (state.phase.type !== "election") {
        if (afterYear === 6 && state.year === 6 && state.phase.type === "opening") {
          state = openAllParties(state);
          const totalsBeforeCleanup = [4, 8, 8, 9];
          for (const [seatIndex, seat] of state.seats.entries()) {
            seat.operations = {
              organise: totalsBeforeCleanup[seatIndex]!,
              rally: 0,
              smear: 0
            };
          }
          state.seats[0]!.newYearOperations.organise = 1;
          state.bonusCards["night-parliament-quiet-hours"] = {
            zone: "new_year",
            seatId: "seat-4"
          };
          state = closeThroughLobby(state);
          state = resolveClosure(state);
        } else {
          state = closeThroughYear(state);
        }
      }
      expect(state.phase).toMatchObject({
        type: "election",
        electionNumber: index + 1,
        afterYear
      });
      if (afterYear === 6) {
        expect(state.seats[0]!.operations.organise).toBe(5);
        expect(state.seats.every((seat) =>
          Object.values(seat.newYearOperations).every((count) => count === 0)
        )).toBe(true);
        expect(state.bonusCards["night-parliament-quiet-hours"]).toEqual({
          zone: "hand",
          seatId: "seat-4"
        });
        expect(state.bonusCards["night-parliament-midnight-leak"]).toEqual({
          zone: "home"
        });
        finalReplayEvents = [{
          type: "game_initialized",
          state: structuredClone(state)
        }];
      }
      const completed = executeAction(state, createElectionAction(state, zeroRandom));
      state = completed.state;
      finalReplayEvents?.push(...completed.events);
      for (const seat of state.seats) {
        const readied = executeAction(state, {
          type: "set_election_ready",
          seatId: seat.id,
          ready: true
        });
        state = readied.state;
        finalReplayEvents?.push(...readied.events);
      }
      if (index < ELECTION_YEARS.length - 1) {
        expect(state.year).toBe(afterYear + 1);
        expect(state.phase.type).toBe("opening");
      }
    }

    expect(state.year).toBe(6);
    expect(state.electionHistory.map((election) => election.afterYear)).toEqual([2, 4, 6]);
    expect(state.electionHistory.at(-1)!.scores.map((score) => ({
      count: score.finalCardCount,
      bonus: score.finalCardRankBonus
    }))).toEqual([
      { count: 5, bonus: 0 },
      { count: 8, bonus: 2 },
      { count: 8, bonus: 2 },
      { count: 10, bonus: 3 }
    ]);
    expect(state.phase.type).toBe("complete");
    expect(state.phase).toMatchObject({
      winnerSeatIds: state.electionHistory.at(-1)!.winnerSeatIds
    });
    const replayed = replay(finalReplayEvents!);
    expect(replayed).toEqual(state);
    expect(projectGameState(replayed, "seat-1").electionHistory.at(-1)!.scores.map((score) => ({
      count: score.finalCardCount,
      bonus: score.finalCardRankBonus
    }))).toEqual([
      { count: 5, bonus: 0 },
      { count: 8, bonus: 2 },
      { count: 8, bonus: 2 },
      { count: 10, bonus: 3 }
    ]);
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

function playUnbound(
  state: GameState,
  partyId: PartyId,
  bonusCardId: BonusCardId,
  choice: unknown
): GameState {
  const seatId = lobbyPhase(state).activeSeatId;
  state.bonusCards[bonusCardId] = { zone: "hand", seatId };
  return act(state, {
    type: "operate",
    seatId,
    partyId,
    play: { cardType: "bonus", bonusCardId, choice }
  });
}

function clearSupport(state: GameState): void {
  for (const districtId of DISTRICT_IDS) {
    state.support[districtId] = {};
  }
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

function closeThroughYear(initial: GameState): GameState {
  const state = closeThroughLobby(openAllParties(initial));
  return resolveClosure(state);
}

function closeThroughLobby(initial: GameState): GameState {
  let state = initial;
  while (state.phase.type === "lobby") {
    const phase = state.phase;
    const seatId = phase.activeSeatId;
    const openParty = Object.values(state.parties).find(
      (party) => party?.ownerSeatId === seatId && party.status === "open"
    );
    if ((phase.turnsTaken[seatId] ?? 0) === 0) {
      state = act(state, {
        type: "collect",
        seatId,
        partyId: PARTY_IDS.find((partyId) => state.parties[partyId]?.status === "open")!
      });
    } else if (openParty !== undefined) {
      state = act(state, { type: "close", seatId, partyId: openParty.partyId });
    } else {
      state = act(state, { type: "pass", seatId });
    }
  }
  return state;
}

function resolveClosure(
  initial: GameState,
  choices: Partial<Record<PartyId, BonusCardId>> = {}
): GameState {
  let state = initial;
  while (state.phase.type === "closure") {
    const partyId = state.phase.pendingPartyIds[0]!;
    const party = state.parties[partyId]!;
    const bonusCardId = choices[partyId];
    state = act(state, {
      type: "choose_closure_bonus",
      seatId: party.ownerSeatId,
      partyId,
      ...(bonusCardId === undefined ? {} : { bonusCardId })
    });
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

function firstOpenParty(state: GameState): PartyId {
  const partyId = PARTY_IDS.find(
    (candidate) => state.parties[candidate]?.status === "open"
  );
  if (partyId === undefined) throw new Error("No open party");
  return partyId;
}

function partyOpenedByAnyStatus(state: GameState, seatId: string): PartyId {
  const party = Object.values(state.parties).find(
    (candidate) => candidate?.ownerSeatId === seatId
  );
  if (party === undefined) throw new Error(`No party for ${seatId}`);
  return party.partyId;
}

function organise(sourceDistrictId: string, destinationDistrictId: string): OperationPlayInput {
  return {
    cardType: "operation",
    operation: "organise",
    choice: { operation: "organise", sourceDistrictId, destinationDistrictId }
  };
}
