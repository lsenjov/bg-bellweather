import {
  DISTRICTS,
  DISTRICTS_BY_ID,
  PARTY_IDS,
  SCORING_CARDS_BY_ID,
  type OperationId,
  type PartyId
} from "@bellweather/content";
import { describe, expect, it } from "vitest";
import {
  GameRuleError,
  createElectionAction,
  dealScoringCards,
  executeAction,
  initializeGame,
  openingTurnSeatIds,
  projectGameState,
  replay,
  type GameAction,
  type GameEvent,
  type GameState,
  type OperationInventory,
  type RandomSource
} from "../src/index.js";

describe("game setup and private projections", () => {
  it.each([
    [2, 1, 20, 8, 8, 10, 4],
    [3, 1, 20, 8, 8, 10, 4],
    [4, 1, 10, 4, 4, 5, 2],
    [5, 1, 10, 4, 4, 5, 2],
    [6, 1, 10, 4, 4, 5, 2]
  ])(
    "creates the committed economy for %i players",
    (playerCount, firms, leverage, bluff, rally, points, slots) => {
      const state = initializeGame(
        configuration(playerCount, null),
        zeroRandom
      ).state;
      expect(state.seats).toHaveLength(playerCount);
      expect(state.seats.every((seat) => seat.firmIds.length === firms)).toBe(
        true
      );
      expect(state.seats.every((seat) => seat.reserve.leverage === leverage)).toBe(
        true
      );
      expect(state.seats.every((seat) => seat.reserve.bluff === bluff)).toBe(
        true
      );
      expect(
        state.seats.every((seat) => seat.reserve.operations.rally === rally)
      ).toBe(true);
      expect(state.seats.every((seat) => seat.reserve.points === points)).toBe(
        true
      );
      expect(
        state.seats.every(
          (seat) => seat.scoringCardIds.length === (playerCount <= 3 ? 2 : 1)
        )
      ).toBe(true);
      expect(
        Object.values(state.counterbidSlots).every(
          (counterbids) => counterbids.length === slots
        )
      ).toBe(true);
    }
  );

  it("creates doubled low-player economies and records all random setup outcomes", () => {
    const initialized = initializeGame(configuration(2, null), zeroRandom);
    const state = initialized.state;

    expect(state.seats.map((seat) => seat.firmIds.length)).toEqual([1, 1]);
    expect(state.seats[0]?.reserve).toEqual({
      leverage: 20,
      bluff: 8,
      operations: { organise: 4, rally: 8, smear: 4, court: 4 },
      points: 10
    });
    expect(state.partyOrder).toHaveLength(6);
    expect(new Set(state.partyOrder).size).toBe(6);
    expect(state.scoringDecks).toHaveLength(2);
    expect(
      state.scoringDecks.every(
        (deck) => deck.length === 24 && new Set(deck).size === 24
      )
    ).toBe(true);
    expect(state.support["harbormouth"]).toEqual(
      Object.fromEntries(PARTY_IDS.map((party) => [party, 1]))
    );
    expect(replay([initialized])).toEqual(state);
  });

  it("rejects state from any non-current ruleset", () => {
    const initialized = initializeGame(configuration(2, null), zeroRandom);
    initialized.state.rulesetVersion = "8";

    expect(() => replay([initialized])).toThrow("Only ruleset 13 is supported");
    expect(() => projectGameState(initialized.state, null)).toThrow(
      "Only ruleset 13 is supported"
    );
  });

  it("discards overlapping second draws and deals compatible low-player pairs", () => {
    const hands = dealScoringCards(
      ["SC-01", "SC-07", "SC-02", "SC-03", "SC-04"],
      2
    );

    expect(hands).toEqual([
      ["SC-01", "SC-02"],
      ["SC-03", "SC-04"]
    ]);
    for (const hand of hands) {
      const districts = hand.flatMap((cardId) =>
        SCORING_CARDS_BY_ID[cardId].objectives.map(
          (objective) => objective.districtId
        )
      );
      expect(new Set(districts).size).toBe(6);
    }
  });

  it("recycles rejected second draws when a low-player deal exhausts the draw pile", () => {
    const deck = [
      "SC-22", "SC-03", "SC-09", "SC-10", "SC-16", "SC-02",
      "SC-08", "SC-13", "SC-23", "SC-15", "SC-19", "SC-04",
      "SC-05", "SC-18", "SC-06", "SC-07", "SC-12", "SC-21",
      "SC-20", "SC-01", "SC-24", "SC-11", "SC-14", "SC-17"
    ] as const;

    const hands = dealScoringCards(deck, 3);

    expect(hands).toHaveLength(3);
    for (const hand of hands) {
      const districts = hand.flatMap((cardId) =>
        SCORING_CARDS_BY_ID[cardId].objectives.map(
          (objective) => objective.districtId
        )
      );
      expect(new Set(districts).size).toBe(6);
    }
  });

  it.each([4, 5, 6])(
    "retains one scoring card at %i players",
    (playerCount) => {
      const hands = dealScoringCards(
        Object.keys(SCORING_CARDS_BY_ID) as Array<keyof typeof SCORING_CARDS_BY_ID>,
        playerCount
      );
      expect(hands).toHaveLength(playerCount);
      expect(hands.every((hand) => hand.length === 1)).toBe(true);
    }
  );

  it("applies Election retention to every non-Centre district", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    const scoredDistrictIds = new Set(
      state.seats.flatMap((seat) =>
        seat.scoringCardIds.flatMap((cardId) =>
          SCORING_CARDS_BY_ID[cardId].objectives.map(
            (objective) => objective.districtId
          )
        )
      )
    );
    const unscoredDistrict = DISTRICTS.find(
      (district) =>
        district.id !== "bellweather-centre" &&
        !scoredDistrictIds.has(district.id)
    )!;
    state.support[unscoredDistrict.id] = Object.fromEntries(
      PARTY_IDS.slice(0, unscoredDistrict.capacity).map((partyId) => [partyId, 1])
    );
    state.support["bellweather-centre"] = {
      honeycomb: 1,
      "old-shell": 1,
      foxglove: 1
    };
    state.courtSupport.honeycomb.foxglove = 2;
    state.coalitionTargets.honeycomb = "foxglove";
    state.round = 4;
    state.phase = {
      type: "election",
      electionNumber: 1,
      afterRound: 4,
      resultsRecorded: false,
      readySeatIds: []
    };

    let result = executeAction(
      state,
      createElectionAction(state, zeroRandom)
    ).state;

    expect(
      Object.values(result.support[unscoredDistrict.id]).reduce(
        (total, count) => total + (count ?? 0),
        0
      )
    ).toBe(unscoredDistrict.capacity / 2);
    expect(Object.keys(result.electionHistory[0]!.draws)).toHaveLength(15);
    expect(result.support["bellweather-centre"]).toEqual({
      honeycomb: 1,
      "old-shell": 1,
      foxglove: 1
    });
    expect(result.courtSupport.honeycomb.foxglove).toBe(2);
    for (const seat of result.seats) {
      result = act(result, {
        type: "set_election_ready",
        seatId: seat.id,
        ready: true
      });
    }
    expect(result.courtSupport.honeycomb).toEqual({});
    expect(result.coalitionTargets.honeycomb).toBe("foxglove");
  });

  it("shows only seat-visible reserves, agendas, and bid contents before reveal", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    state = submitAllOpenings(state, 100);
    state = act(state, {
      type: "set_counterbid",
      seatId: "seat-1",
      slotIndex: 0,
      now: 100,
      bid: {
        contestId: PARTY_IDS[0],
        firmId: state.seats[0]!.firmIds[0]!,
        leverage: 3,
        bluff: 1,
        operations: operations({ court: 1 })
      }
    });

    const owner = projectGameState(state, "seat-1");
    const opponent = projectGameState(state, "seat-2");
    const counterId = state.counterbidSlots["seat-1"]![0]!;
    const openingId = Object.values(state.bids).find(
      (bid) => bid.kind === "opening" && bid.ownerSeatId === "seat-1"
    )!.id;
    expect(owner.seats[0]?.reserve).not.toBeNull();
    expect(owner.seats[1]?.reserve).toBeNull();
    expect(opponent.seats[0]?.scoringCardIds).toBeNull();
    expect(owner.seats[0]?.scoringCardIds).toHaveLength(2);
    expect(owner.bids.find((bid) => bid.id === counterId)?.leverage).toBe(3);
    expect(opponent.bids.find((bid) => bid.id === counterId)).toMatchObject({
      contestId: PARTY_IDS[0],
      cardCount: 5,
      leverage: null,
      bluff: null,
      operationCount: null,
      operations: null
    });
    expect(opponent.bids.find((bid) => bid.id === openingId)).toMatchObject({
      cardCount: 1,
      leverage: 1,
      bluff: null,
      operationCount: null,
      operations: null
    });
    expect(() => projectGameState(state, "seat-1", true)).toThrow(
      "Full information"
    );
  });
});

describe("opening and counterbid phases", () => {
  it("builds Early Bird-relative opening order for every seat and player count", () => {
    for (let playerCount = 2; playerCount <= 6; playerCount += 1) {
      const seats = configuration(playerCount, null).seats.map((seat, position) => ({
        id: seat.id,
        position
      }));
      for (let firstIndex = 0; firstIndex < playerCount; firstIndex += 1) {
        const clockwise = [
          ...seats.slice(firstIndex),
          ...seats.slice(0, firstIndex)
        ].map((seat) => seat.id);
        expect(openingTurnSeatIds(seats, seats[firstIndex]!.id)).toEqual(
          playerCount <= 3
            ? [...clockwise, ...clockwise.toReversed()]
            : clockwise
        );
      }
    }
  });

  it.each([
    [2, ["seat-1", "seat-2", "seat-2", "seat-1"]],
    [3, ["seat-1", "seat-2", "seat-3", "seat-3", "seat-2", "seat-1"]],
    [4, ["seat-1", "seat-2", "seat-3", "seat-4"]]
  ])("advances one opening at a time in the %i-player order", (playerCount, order) => {
    let state = initializeGame(configuration(playerCount, null), zeroRandom).state;
    expect(state.phase).toEqual({
      type: "opening",
      turnSeatIds: order,
      turnIndex: 0
    });

    for (const [turnIndex, seatId] of order.entries()) {
      expect(state.phase).toMatchObject({ type: "opening", turnIndex });
      if (state.phase.type !== "opening") {
        throw new Error("Expected opening phase");
      }
      expect(state.phase.turnSeatIds[state.phase.turnIndex]).toBe(seatId);
      const seat = state.seats.find((candidate) => candidate.id === seatId)!;
      const partyId = PARTY_IDS[turnIndex]!;
      state = act(state, {
        type: "submit_openings",
        seatId,
        now: turnIndex,
        openings: [opening(seat.firmIds[0]!, partyId, 1)]
      });
      expect(state.contests[partyId]).toBeDefined();
    }

    expect(state.phase.type).toBe("counterbidding");
  });

  it("requires an affordable opening, permits an insolvent pass, and rechecks a later turn", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    state.seats[0]!.reserve.leverage = 2;
    state.seats[1]!.reserve.leverage = 0;
    const firstSeat = state.seats[0]!;
    const secondSeat = state.seats[1]!;

    expect(() =>
      act(state, {
        type: "submit_openings",
        seatId: firstSeat.id,
        now: 0,
        openings: []
      })
    ).toThrow("must open 1 contest");
    expect(() =>
      act(state, {
        type: "submit_openings",
        seatId: firstSeat.id,
        now: 0,
        openings: [
          opening(firstSeat.firmIds[0]!, "invented-party" as PartyId, 1)
        ]
      })
    ).toThrow("does not exist");
    state = act(state, {
      type: "submit_openings",
      seatId: firstSeat.id,
      now: 0,
      openings: [opening(firstSeat.firmIds[0]!, PARTY_IDS[0], 1)]
    });
    state = act(state, {
      type: "submit_openings",
      seatId: secondSeat.id,
      now: 1,
      openings: []
    });
    state = act(state, {
      type: "give_resources",
      seatId: firstSeat.id,
      recipientSeatId: secondSeat.id,
      resources: {
        leverage: 1,
        bluff: 0,
        operations: operations(),
        points: 0
      }
    });
    expect(() =>
      act(state, {
        type: "submit_openings",
        seatId: secondSeat.id,
        now: 2,
        openings: []
      })
    ).toThrow("must open 1 contest");
    state = act(state, {
      type: "submit_openings",
      seatId: secondSeat.id,
      now: 2,
      openings: [opening(secondSeat.firmIds[0]!, PARTY_IDS[1], 1)]
    });
    state = act(state, {
      type: "submit_openings",
      seatId: firstSeat.id,
      now: 3,
      openings: []
    });

    expect(state.phase.type).toBe("counterbidding");
    expect(Object.keys(state.contests)).toEqual([
      "pecking-order",
      PARTY_IDS[0],
      PARTY_IDS[1]
    ]);
  });

  it("allows ready/unready, closes early when all ready, and enforces optional deadline", () => {
    let untimed = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      1_000
    );
    untimed = act(untimed, {
      type: "set_counterbid_ready",
      seatId: "seat-1",
      ready: true,
      now: 1_001
    });
    expect(untimed.phase).toMatchObject({
      type: "counterbidding",
      readySeatIds: ["seat-1"]
    });
    untimed = act(untimed, {
      type: "set_counterbid_ready",
      seatId: "seat-1",
      ready: false,
      now: 1_002
    });
    expect(untimed.phase).toMatchObject({ readySeatIds: [] });
    expect(() =>
      act(untimed, {
        type: "set_counterbid_ready",
        seatId: "seat-1",
        ready: "yes" as unknown as boolean,
        now: 1_003
      })
    ).toThrow("must be boolean");
    expect(() =>
      act(untimed, { type: "expire_counterbids", now: 99_999 })
    ).toThrow("no counterbid timer");

    let timed = submitAllOpenings(
      initializeGame(configuration(2, 10), zeroRandom).state,
      1_000
    );
    expect(timed.phase).toMatchObject({
      type: "counterbidding",
      deadlineAt: 11_000
    });
    expect(() =>
      act(timed, { type: "expire_counterbids", now: 10_999 })
    ).toThrow("has not passed");
    expect(() =>
      act(timed, {
        type: "set_counterbid_ready",
        seatId: "seat-1",
        ready: true,
        now: 11_000
      })
    ).toThrow("deadline has passed");
    timed = act(timed, { type: "expire_counterbids", now: 11_000 });
    expect(timed).toMatchObject({ round: 2, phase: { type: "opening" } });
    expect(timed.roundHistory[0]?.bids).not.toEqual({});
  });

  it("uses the same digital firm across all four low-player counterbid cards", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      1_000
    );
    const firmId = state.seats[0]!.firmIds[0]!;
    state = setBid(state, "seat-1", 3, PARTY_IDS[0], 1);

    const bidId = state.counterbidSlots["seat-1"]![3]!;
    expect(state.bids[bidId]?.firmId).toBe(firmId);
  });

  it("cancels equal counterbids and performs the circular Revolving Door", () => {
    let tied = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      0
    );
    const contestId = PARTY_IDS[0];
    tied = setBid(tied, "seat-1", 0, contestId, 2);
    tied = setBid(tied, "seat-2", 0, contestId, 2);
    tied = readyAll(tied);
    expect(tied.seats.map((seat) => seat.reserve.leverage)).toEqual([20, 20]);

    let revolved = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      0
    );
    revolved = setBid(revolved, "seat-2", 0, contestId, 2, 1);
    revolved = readyAll(revolved);
    expect(revolved.seats.map((seat) => seat.reserve.leverage)).toEqual([21, 19]);
    expect(revolved.seats.map((seat) => seat.reserve.bluff)).toEqual([9, 7]);
  });

  it("keeps future tied counterbids escrowed until their contest starts", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      0
    );
    const orderedContests = state.partyOrder.filter(
      (partyId) => state.contests[partyId] !== undefined
    );
    const currentContestId = orderedContests[0]!;
    const futureContestId = orderedContests[1]!;
    const currentOpeningBid =
      state.bids[state.contests[currentContestId]!.openingBidId!]!;
    for (const contestId of [currentContestId, futureContestId]) {
      const openingBid = state.bids[state.contests[contestId]!.openingBidId!]!;
      openingBid.operations.smear = 1;
      const owner = state.seats.find(
        (seat) => seat.id === openingBid.ownerSeatId
      )!;
      owner.reserve.operations.smear -= 1;
    }
    state = setBid(state, "seat-1", 0, futureContestId, 2);
    state = setBid(state, "seat-2", 0, futureContestId, 2);
    const tiedBidIds = state.seats.map(
      (seat) => state.counterbidSlots[seat.id]![0]!
    );
    const escrowedLeverage = state.seats.map(
      (seat) => seat.reserve.leverage
    );

    state = readyAll(state);

    expect(state.phase).toMatchObject({
      type: "resolution",
      pendingDecision: { contestId: currentContestId }
    });
    expect(tiedBidIds.map((bidId) => state.bids[bidId]!.status)).toEqual([
      "active",
      "active"
    ]);
    expect(state.seats.map((seat) => seat.reserve.leverage)).toEqual(
      escrowedLeverage
    );

    const decision = pending(state);
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "smear",
      choice: {
        operation: "smear",
        districtId: "harbormouth",
        rivalParty: PARTY_IDS.find((partyId) => partyId !== currentContestId)!
      }
    });

    expect(state.phase).toMatchObject({
      type: "resolution",
      pendingDecision: { contestId: futureContestId }
    });
    expect(tiedBidIds.map((bidId) => state.bids[bidId]!.status)).toEqual([
      "cancelled",
      "cancelled"
    ]);
    expect(state.seats.map((seat) => seat.reserve.leverage)).toEqual(
      escrowedLeverage.map(
        (leverage, index) =>
          leverage +
          2 +
          (state.seats[index]!.id === currentOpeningBid.ownerSeatId
            ? currentOpeningBid.leverage
            : 0)
      )
    );
  });
});

describe("contest resolution", () => {
  it("resolves Pecking Order low-to-high, records the swap, and changes next opener", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ smear: 1 }) }
    );
    const seatTwo = state.seats[1]!;
    state = act(state, {
      type: "set_counterbid",
      seatId: seatTwo.id,
      slotIndex: 0,
      now: 1,
      bid: {
        contestId: "pecking-order",
        firmId: seatTwo.firmIds[0]!,
        leverage: 0,
        bluff: 1,
        operations: operations({ organise: 1 })
      }
    });
    state = readyAll(state);
    expect(state.phase).toMatchObject({
      type: "resolution",
      pendingDecision: { kind: "pecking_swap", seatId: seatTwo.id }
    });
    const before = [...state.partyOrder];
    const peckingDecision = pending(state);
    state = act(state, {
      type: "resolve_pecking_swap",
      seatId: seatTwo.id,
      decisionId: peckingDecision.id,
      adjacentIndex: 0
    });
    expect(state.partyOrder.slice(0, 2)).toEqual([before[1], before[0]]);

    const partyDecision = pending(state);
    expect(partyDecision.kind).toBe("party_operation");
    state = act(state, {
      type: "resolve_party_operation",
      seatId: partyDecision.seatId,
      decisionId: partyDecision.id,
      operation: "smear",
      choice: {
        operation: "smear",
        districtId: "harbormouth",
        rivalParty: "old-shell"
      }
    });
    expect(state.support.harbormouth["old-shell"]).toBeUndefined();
    expect(state.phase.type).toBe("opening");
    if (state.phase.type !== "opening") {
      throw new Error("Expected opening phase");
    }
    expect(state.phase.turnSeatIds[0]).toBe(seatTwo.id);
    expect(state.phase.turnIndex).toBe(0);
  });

  it("resolves party contests in the order produced by Pecking Order swaps", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0
    );
    const adjacentIndex = state.partyOrder.findIndex(
      (partyId, index) =>
        index < state.partyOrder.length - 1 &&
        state.contests[partyId] !== undefined &&
        state.contests[state.partyOrder[index + 1]!] !== undefined
    );
    expect(adjacentIndex).toBeGreaterThanOrEqual(0);
    const originalLeft = state.partyOrder[adjacentIndex]!;
    const originalRight = state.partyOrder[adjacentIndex + 1]!;
    const leftBidder = state.seats[1]!;
    const rightBidder = state.seats[2]!;
    const peckingBidder = state.seats[3]!;

    state = act(state, {
      type: "set_counterbid",
      seatId: leftBidder.id,
      slotIndex: 0,
      now: 1,
      bid: {
        contestId: originalLeft,
        firmId: leftBidder.firmIds[0]!,
        leverage: 0,
        bluff: 0,
        operations: operations({ smear: 1 })
      }
    });
    state = act(state, {
      type: "set_counterbid",
      seatId: rightBidder.id,
      slotIndex: 0,
      now: 1,
      bid: {
        contestId: originalRight,
        firmId: rightBidder.firmIds[0]!,
        leverage: 0,
        bluff: 0,
        operations: operations({ rally: 1 })
      }
    });
    state = act(state, {
      type: "set_counterbid",
      seatId: peckingBidder.id,
      slotIndex: 0,
      now: 1,
      bid: {
        contestId: "pecking-order",
        firmId: peckingBidder.firmIds[0]!,
        leverage: 0,
        bluff: 0,
        operations: operations({ organise: 1 })
      }
    });
    delete state.support.harbormouth[
      PARTY_IDS.find((partyId) => partyId !== originalRight)!
    ];
    state = readyAll(state);

    const peckingDecision = pending(state);
    const peckingAction = {
      type: "resolve_pecking_swap",
      seatId: peckingDecision.seatId,
      decisionId: peckingDecision.id,
      adjacentIndex
    } as const satisfies GameAction;
    state = act(state, peckingAction);

    expect(state.partyOrder[adjacentIndex]).toBe(originalRight);
    expect(state.phase).toMatchObject({
      type: "resolution",
      contestOrder: [
        "pecking-order",
        ...state.partyOrder.filter(
          (partyId) => state.contests[partyId] !== undefined
        )
      ],
      pendingDecision: {
        kind: "party_operation",
        contestId: originalRight,
        legalOperations: ["rally"]
      }
    });
  });

  it("applies Old Shell Dig In and prevents claiming its bonus twice", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ organise: 2 }) },
      "old-shell"
    );
    state = readyAll(state);
    let decision = pending(state);
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "organise",
      choice: {
        choice: {
          operation: "organise",
          sourceDistrictId: "harbormouth",
          destinationDistrictId: "cloverfield"
        },
        claimBonus: true,
      }
    });
    expect(state.support.harbormouth["old-shell"]).toBe(1);
    expect(state.support.cloverfield["old-shell"]).toBe(1);
    decision = pending(state);
    expect(() =>
      act(state, {
        type: "resolve_party_operation",
        seatId: decision.seatId,
        decisionId: decision.id,
        operation: "organise",
        choice: {
          choice: {
            operation: "organise",
            sourceDistrictId: "cloverfield",
            destinationDistrictId: "northreach"
          },
          claimBonus: true
        }
      })
    ).toThrow("already claimed");
  });

  it("resolves Night Shift after every contest transfer", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      {
        "seat-1": operations({ rally: 1 }),
        "seat-2": operations({ smear: 1 })
      },
      "night-parliament"
    );
    const nightBid = Object.values(state.bids).find(
      (bid) => bid.contestId === "night-parliament" && bid.kind === "opening"
    )!;
    const laterBid = Object.values(state.bids).find(
      (bid) =>
        bid.ownerSeatId === "seat-2" &&
        bid.kind === "opening" &&
        bid.operations.smear === 1
    )!;
    state.partyOrder = [
      "night-parliament",
      laterBid.contestId as PartyId,
      ...state.partyOrder.filter(
        (partyId) =>
          partyId !== "night-parliament" && partyId !== laterBid.contestId
      )
    ];
    delete state.support.harbormouth[
      PARTY_IDS.find((partyId) => partyId !== laterBid.contestId)!
    ];
    state = readyAll(state);
    let decision = pending(state);
    const claimAction = {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "rally",
      choice: {
        choice: {
          operation: "rally",
          districtId: "harbormouth"
        },
        claimBonus: true
      }
    } as const satisfies GameAction;
    state = act(state, claimAction);
    decision = pending(state);
    expect(decision).toMatchObject({
      kind: "party_operation",
      contestId: laterBid.contestId,
      legalOperations: ["smear"]
    });
    expect(state.bids[nightBid.id]?.status).toBe("transferred");
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "smear",
      choice: {
        operation: "smear",
        districtId: "grand-market",
        rivalParty: PARTY_IDS.find(
          (partyId) =>
            partyId !== laterBid.contestId && partyId !== "night-parliament"
        )!
      }
    });
    decision = pending(state);
    expect(decision).toMatchObject({
      kind: "night_delayed_operation",
      operation: "rally"
    });
    expect(state.bids[laterBid.id]?.status).toBe("transferred");
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "rally",
      choice: {
        operation: "rally",
        districtId: "grand-market"
      }
    });
    expect(state.support["grand-market"]["night-parliament"]).toBe(2);
    expect(state.phase.type).toBe("opening");
  });

  it("automatically fails a delayed operation when no legal choice remains", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      {
        "seat-1": operations({ rally: 1 }),
        "seat-2": operations({ court: 1 })
      },
      "night-parliament"
    );
    const nightBid = Object.values(state.bids).find(
      (bid) => bid.contestId === "night-parliament" && bid.kind === "opening"
    )!;
    const laterBid = Object.values(state.bids).find(
      (bid) =>
        bid.ownerSeatId === "seat-2" &&
        bid.kind === "opening" &&
        bid.operations.court === 1
    )!;
    state.partyOrder = [
      "night-parliament",
      laterBid.contestId as PartyId,
      ...state.partyOrder.filter(
        (partyId) =>
          partyId !== "night-parliament" && partyId !== laterBid.contestId
      )
    ];
    delete state.support.harbormouth.honeycomb;
    state = readyAll(state);
    let decision = pending(state);
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "rally",
      choice: {
        choice: { operation: "rally", districtId: "harbormouth" },
        claimBonus: true
      }
    });
    decision = pending(state);
    expect(decision).toMatchObject({
      kind: "party_operation",
      contestId: laterBid.contestId,
      legalOperations: ["court"]
    });

    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "court",
      choice: {
        operation: "court",
        targetParty: PARTY_IDS.find(
          (partyId) => partyId !== laterBid.contestId
        )!
      }
    });

    expect(state.phase.type).toBe("opening");
    expect(
      state.resolvedOperations.findLast(
        (resolution) =>
          resolution.bidId === nightBid.id &&
          resolution.operation === "rally"
      )
    ).toMatchObject({
      choice: null,
      baselineApplied: false,
      bonusApplied: true,
      failure: "No legal choice remained for the delayed operation"
    });
  });

  it("rejects malformed party identifiers in operation choices", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ court: 1 }) },
      "honeycomb"
    );
    state = readyAll(state);
    const decision = pending(state);
    expect(() =>
      act(state, {
        type: "resolve_party_operation",
        seatId: decision.seatId,
        decisionId: decision.id,
        operation: "court",
        choice: {
          operation: "court",
          targetParty: "invented-party"
        }
      })
    ).toThrow("must be a party");
  });

  it("rejects illegal operation choices without consuming the decision", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ organise: 1, smear: 1 }) },
      "honeycomb"
    );
    state = readyAll(state);
    const decision = pending(state);
    const before = structuredClone(state);

    expect(() =>
      act(state, {
        type: "resolve_party_operation",
        seatId: decision.seatId,
        decisionId: decision.id,
        operation: "organise",
        choice: {
          operation: "organise",
          sourceDistrictId: "harbormouth",
          destinationDistrictId: "northreach"
        }
      })
    ).toThrow("must neighbor the source");
    expect(state).toEqual(before);

    expect(() =>
      act(state, {
        type: "resolve_party_operation",
        seatId: decision.seatId,
        decisionId: decision.id,
        operation: "smear",
        choice: {
          operation: "smear",
          districtId: "northreach",
          rivalParty: "old-shell"
        }
      })
    ).toThrow("requires rival Support");
    expect(state).toEqual(before);
  });

  it("fails every remaining card and advances when no operation is legal", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ organise: 1, rally: 2 }) },
      "honeycomb"
    );
    const bid = Object.values(state.bids).find(
      (candidate) =>
        candidate.ownerSeatId === "seat-1" &&
        candidate.contestId === "honeycomb"
    )!;
    for (const district of DISTRICTS) {
      state.support[district.id] = { honeycomb: district.capacity };
    }

    state = readyAll(state);

    expect(state.phase.type).toBe("opening");
    expect(
      state.resolvedOperations.filter(
        (resolution) => resolution.bidId === bid.id
      )
    ).toEqual([
      expect.objectContaining({
        operation: "organise",
        baselineApplied: false,
        failure: "No legal choice remained for this operation"
      }),
      expect.objectContaining({
        operation: "rally",
        baselineApplied: false,
        failure: "No legal choice remained for this operation"
      }),
      expect.objectContaining({
        operation: "rally",
        baselineApplied: false,
        failure: "No legal choice remained for this operation"
      })
    ]);
  });

  it("offers another legal family before failing an impossible card", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ rally: 1, court: 1 }) },
      "honeycomb"
    );
    const bid = Object.values(state.bids).find(
      (candidate) =>
        candidate.ownerSeatId === "seat-1" &&
        candidate.contestId === "honeycomb"
    )!;
    for (const district of DISTRICTS) {
      state.support[district.id] = { honeycomb: district.capacity };
    }
    state = readyAll(state);
    const decision = pending(state);
    expect(decision).toMatchObject({
      kind: "party_operation",
      legalOperations: ["court"]
    });

    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "court",
      choice: { operation: "court", targetParty: "old-shell" }
    });

    expect(state.phase.type).toBe("opening");
    expect(
      state.resolvedOperations.find(
        (resolution) =>
          resolution.bidId === bid.id && resolution.operation === "rally"
      )
    ).toMatchObject({
      baselineApplied: false,
      failure: "No legal choice remained for this operation"
    });
  });
});

describe("social actions, elections, and replay", () => {
  it("records public chat and atomically gives only available reserves and points", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    state = act(state, {
      type: "post_chat",
      seatId: "seat-1",
      text: "  Your move.  ",
      now: 42
    });
    state = act(state, {
      type: "give_resources",
      seatId: "seat-1",
      recipientSeatId: "seat-2",
      resources: {
        leverage: 2,
        bluff: 1,
        operations: operations({ court: 1 }),
        points: 3
      }
    });
    expect(state.chat[0]).toMatchObject({ text: "Your move.", sentAt: 42 });
    expect(state.seats.map((seat) => seat.reserve.points)).toEqual([7, 13]);
    expect(state.seats.map((seat) => seat.reserve.leverage)).toEqual([18, 22]);
    expect(state.seats.map((seat) => seat.reserve.bluff)).toEqual([7, 9]);
    expect(() =>
      act(state, {
        type: "give_resources",
        seatId: "seat-1",
        recipientSeatId: "seat-2",
        resources: {
          leverage: 0,
          bluff: 0,
          operations: operations(),
          points: 8
        }
      })
    ).toThrow("enough points");
  });

  it("plays twelve rounds, computes all three Elections from recorded randomness, and replays exactly", () => {
    const events: GameEvent[] = [initializeGame(configuration(2, null), zeroRandom)];
    let state = replay(events);
    let now = 0;
    let finalGiftMade = false;

    while (state.phase.type !== "complete") {
      if (state.phase.type === "opening") {
        const action = openingsForActiveSeat(state, now);
        ({ state } = executeAndRecord(state, action, events));
        now += 1;
      } else if (state.phase.type === "counterbidding") {
        const unready = state.seats.find(
          (seat) => !state.phase.readySeatIds.includes(seat.id)
        )!;
        ({ state } = executeAndRecord(
          state,
          {
            type: "set_counterbid_ready",
            seatId: unready.id,
            ready: true,
            now
          },
          events
        ));
      } else if (state.phase.type === "election") {
        if (!state.phase.resultsRecorded) {
          ({ state } = executeAndRecord(
            state,
            createElectionAction(state, zeroRandom),
            events
          ));
        } else {
          if (state.phase.afterRound === 12 && !finalGiftMade) {
            const donor = state.seats[0]!;
            const recipient = state.seats[1]!;
            const points = Math.max(0, donor.reserve.points);
            if (points > 0) {
              ({ state } = executeAndRecord(
                state,
                {
                  type: "give_resources",
                  seatId: donor.id,
                  recipientSeatId: recipient.id,
                  resources: {
                    leverage: 0,
                    bluff: 0,
                    operations: operations(),
                    points
                  }
                },
                events
              ));
            }
            finalGiftMade = true;
          }
          const unready = state.seats.find(
            (seat) => !state.phase.readySeatIds.includes(seat.id)
          )!;
          ({ state } = executeAndRecord(
            state,
            {
              type: "set_election_ready",
              seatId: unready.id,
              ready: true
            },
            events
          ));
        }
      } else {
        throw new Error(`Unexpected pending phase: ${state.phase.type}`);
      }
    }

    expect(state.round).toBe(12);
    expect(state.electionNumber).toBe(3);
    expect(state.electionHistory).toHaveLength(3);
    expect(state.electionHistory.map((election) => election.afterRound)).toEqual([
      4, 8, 12
    ]);
    expect(state.electionHistory[0]?.scoringCards).toHaveLength(2);
    expect(
      state.electionHistory[0]?.scoringCards.every(
        (entry) => entry.scoringCardIds.length === 2
      )
    ).toBe(true);
    expect(Object.keys(state.electionHistory[0]?.draws ?? {}).length).toBeGreaterThan(0);
    expect(state.phase.winnerSeatIds.length).toBeGreaterThan(0);
    expect(state.electionHistory.at(-1)?.winnerSeatIds).toEqual(
      state.phase.winnerSeatIds
    );
    expect(replay(events)).toEqual(state);
    expect(projectGameState(state, "seat-1", true).seats.every(
      (seat) => seat.reserve !== null && seat.scoringCardIds !== null
    )).toBe(true);
  });
});

const zeroRandom: RandomSource = {
  integer: () => 0
};

function configuration(playerCount: number, timer: number | null) {
  return {
    seats: Array.from({ length: playerCount }, (_, index) => ({
      id: `seat-${index + 1}`,
      displayName: `Player ${index + 1}`,
      controller: "human" as const
    })),
    counterbidTimerSeconds: timer
  };
}

function operations(
  overrides: Partial<Record<OperationId, number>> = {}
): OperationInventory {
  return {
    organise: overrides.organise ?? 0,
    rally: overrides.rally ?? 0,
    smear: overrides.smear ?? 0,
    court: overrides.court ?? 0
  };
}

function opening(
  firmId: GameState["seats"][number]["firmIds"][number],
  partyId: PartyId,
  leverage: number,
  operationInventory = operations()
) {
  return { firmId, partyId, leverage, bluff: 0, operations: operationInventory };
}

function act(state: GameState, action: GameAction): GameState {
  return executeAction(state, action).state;
}

function submitAllOpenings(
  initial: GameState,
  now: number,
  seatOperations: Record<string, OperationInventory> = {},
  firstTarget?: PartyId
): GameState {
  let state = initial;
  while (state.phase.type === "opening") {
    state = act(state, openingsForActiveSeat(state, now, seatOperations, firstTarget));
  }
  return state;
}

function openingsForActiveSeat(
  state: GameState,
  now: number,
  seatOperations: Record<string, OperationInventory> = {},
  firstTarget?: PartyId
): Extract<GameAction, { type: "submit_openings" }> {
  if (state.phase.type !== "opening") {
    throw new Error("Expected opening phase");
  }
  const activeSeatId = state.phase.turnSeatIds[state.phase.turnIndex]!;
  const seat = state.seats.find((candidate) => candidate.id === activeSeatId)!;
  const available = PARTY_IDS.filter(
    (party) => state.contests[party] === undefined
  );
  if (
    firstTarget !== undefined &&
    seat.position === 0 &&
    available.includes(firstTarget)
  ) {
    available.splice(available.indexOf(firstTarget), 1);
    available.unshift(firstTarget);
  }
  const count = Math.min(1, seat.reserve.leverage);
  return {
    type: "submit_openings",
    seatId: seat.id,
    now,
    openings: Array.from({ length: count }, (_, index) =>
      opening(
        seat.firmIds[0]!,
        available[index]!,
        1,
        index === 0 ? (seatOperations[seat.id] ?? operations()) : operations()
      )
    )
  };
}

function setBid(
  state: GameState,
  seatId: string,
  slotIndex: number,
  contestId: PartyId,
  leverage: number,
  bluff = 0
): GameState {
  const seat = state.seats.find((candidate) => candidate.id === seatId)!;
  return act(state, {
    type: "set_counterbid",
    seatId,
    slotIndex,
    now: 1,
    bid: {
      contestId,
      firmId: seat.firmIds[0]!,
      leverage,
      bluff,
      operations: operations()
    }
  });
}

function readyAll(initial: GameState): GameState {
  let state = initial;
  for (const seat of state.seats) {
    if (state.phase.type !== "counterbidding") {
      break;
    }
    state = act(state, {
      type: "set_counterbid_ready",
      seatId: seat.id,
      ready: true,
      now: 1
    });
  }
  return state;
}

function pending(state: GameState) {
  if (state.phase.type !== "resolution" || state.phase.pendingDecision === null) {
    throw new Error("Expected a pending resolution decision");
  }
  return state.phase.pendingDecision;
}

function executeAndRecord(
  state: GameState,
  action: GameAction,
  events: GameEvent[]
): { state: GameState } {
  const result = executeAction(state, action);
  events.push(...result.events);
  return { state: result.state };
}
