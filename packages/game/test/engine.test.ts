import {
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
  executeAction,
  initializeGame,
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
    [2, 2, 20, 8, 8, 10, 4],
    [3, 2, 20, 8, 8, 10, 4],
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
        Object.values(state.counterbidSlots).every(
          (counterbids) => counterbids.length === slots
        )
      ).toBe(true);
    }
  );

  it("creates doubled low-player economies and records all random setup outcomes", () => {
    const initialized = initializeGame(configuration(2, null), zeroRandom);
    const state = initialized.state;

    expect(state.seats.map((seat) => seat.firmIds.length)).toEqual([2, 2]);
    expect(state.seats[0]?.reserve).toEqual({
      leverage: 20,
      bluff: 8,
      operations: { organise: 4, rally: 8, smear: 4, court: 2 },
      points: 10
    });
    expect(state.partyOrder).toHaveLength(6);
    expect(new Set(state.partyOrder).size).toBe(6);
    expect(state.support["harbormouth"]).toEqual(
      Object.fromEntries(PARTY_IDS.map((party) => [party, 1]))
    );
    expect(replay([initialized])).toEqual(state);
  });

  it("applies Election retention to named districts but not Bellweather Centre", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    const namedDistrictId =
      SCORING_CARDS_BY_ID[state.seats[0]!.scoringCardId].objectives[0]!.districtId;
    const capacity = DISTRICTS_BY_ID[namedDistrictId].capacity;
    state.support[namedDistrictId] = Object.fromEntries(
      PARTY_IDS.slice(0, capacity).map((partyId) => [partyId, 1])
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
      Object.values(result.support[namedDistrictId]).reduce(
        (total, count) => total + (count ?? 0),
        0
      )
    ).toBe(capacity / 2);
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
    expect(opponent.seats[0]?.scoringCardId).toBeNull();
    expect(owner.bids.find((bid) => bid.id === counterId)?.leverage).toBe(3);
    expect(opponent.bids.find((bid) => bid.id === counterId)).toMatchObject({
      contestId: PARTY_IDS[0],
      leverage: null,
      bluff: null,
      operationCount: null,
      operations: null
    });
    expect(opponent.bids.find((bid) => bid.id === openingId)).toMatchObject({
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
  it("requires every affordable opening with distinct firms and targets", () => {
    const state = initializeGame(configuration(2, null), zeroRandom).state;
    const seat = state.seats[0]!;
    expect(() =>
      act(state, {
        type: "submit_openings",
        seatId: seat.id,
        now: 0,
        openings: [
          opening(seat.firmIds[0]!, PARTY_IDS[0], 1),
          opening(seat.firmIds[0]!, PARTY_IDS[1], 1)
        ]
      })
    ).toThrow("firm can open only one");
    expect(state.phase.type).toBe("opening");
    expect(state.seats[0]?.reserve.leverage).toBe(20);
    expect(() =>
      act(state, {
        type: "submit_openings",
        seatId: seat.id,
        now: 0,
        openings: [
          opening(seat.firmIds[0]!, "invented-party" as PartyId, 1),
          opening(seat.firmIds[1]!, PARTY_IDS[1], 1)
        ]
      })
    ).toThrow("does not exist");
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
    expect(state.phase).toMatchObject({
      type: "opening",
      activeSeatId: seatTwo.id
    });
  });

  it("applies Many Wings repeated Organise and prevents claiming its bonus twice", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ organise: 2 }) },
      "many-wings"
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
        repeatChoice: {
          operation: "organise",
          sourceDistrictId: "cloverfield",
          destinationDistrictId: "northreach"
        }
      }
    });
    expect(state.support.harbormouth["many-wings"]).toBeUndefined();
    expect(state.support.northreach["many-wings"]).toBe(1);
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
            sourceDistrictId: "northreach",
            destinationDistrictId: "crown-road"
          },
          claimBonus: true,
          repeatChoice: {
            operation: "organise",
            sourceDistrictId: "crown-road",
            destinationDistrictId: "bellweather-centre"
          }
        }
      })
    ).toThrow("already claimed");
  });

  it("queues and resolves Night Parliament's delayed Court before transfer", () => {
    let state = submitAllOpenings(
      initializeGame(configuration(4, null), zeroRandom).state,
      0,
      { "seat-1": operations({ court: 1 }) },
      "night-parliament"
    );
    state = readyAll(state);
    let decision = pending(state);
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "court",
      choice: {
        choice: {
          operation: "court",
          targetParty: "honeycomb"
        },
        claimBonus: true
      }
    });
    decision = pending(state);
    expect(decision).toMatchObject({
      kind: "night_delayed_operation",
      operation: "court"
    });
    state = act(state, {
      type: "resolve_party_operation",
      seatId: decision.seatId,
      decisionId: decision.id,
      operation: "court",
      choice: {
        operation: "court",
        targetParty: "foxglove"
      }
    });
    expect(state.courtSupport["night-parliament"]).toEqual({
      honeycomb: 1,
      foxglove: 1
    });
    expect(state.coalitionTargets["night-parliament"]).toBe("honeycomb");
    expect(state.phase.type).toBe("opening");
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
    expect(Object.keys(state.electionHistory[0]?.draws ?? {}).length).toBeGreaterThan(0);
    expect(state.phase.winnerSeatIds.length).toBeGreaterThan(0);
    expect(state.electionHistory.at(-1)?.winnerSeatIds).toEqual(
      state.phase.winnerSeatIds
    );
    expect(replay(events)).toEqual(state);
    expect(projectGameState(state, "seat-1", true).seats.every(
      (seat) => seat.reserve !== null && seat.scoringCardId !== null
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
  const seat = state.seats.find((candidate) => candidate.id === state.phase.activeSeatId)!;
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
  const count = Math.min(seat.firmIds.length, seat.reserve.leverage);
  return {
    type: "submit_openings",
    seatId: seat.id,
    now,
    openings: Array.from({ length: count }, (_, index) =>
      opening(
        seat.firmIds[index]!,
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
