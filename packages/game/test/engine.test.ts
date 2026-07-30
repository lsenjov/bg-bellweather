import { PARTY_IDS, type OperationId, type PartyId } from "@bellwether/content";
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
  it("creates doubled low-player economies and records all random setup outcomes", () => {
    const initialized = initializeGame(configuration(2, null), zeroRandom);
    const state = initialized.state;

    expect(state.seats.map((seat) => seat.firmIds.length)).toEqual([2, 2]);
    expect(state.seats[0]?.reserve).toEqual({
      clout: 20,
      operations: { organise: 4, rally: 4, smear: 4, court: 2 },
      points: 10
    });
    expect(state.partyOrder).toHaveLength(6);
    expect(new Set(state.partyOrder).size).toBe(6);
    expect(state.support["harbormouth"]).toEqual(
      Object.fromEntries(PARTY_IDS.map((party) => [party, 1]))
    );
    expect(replay([initialized])).toEqual(state);
  });

  it("shows only seat-visible reserves, agendas, and bid contents before reveal", () => {
    let state = initializeGame(configuration(2, null), zeroRandom).state;
    state = submitAllOpenings(state, 100);
    state = act(state, {
      type: "set_counterbid",
      seatId: "seat-1",
      slotIndex: 0,
      bid: {
        contestId: PARTY_IDS[0],
        firmId: state.seats[0]!.firmIds[0]!,
        clout: 3,
        operations: operations({ court: 1 })
      }
    });

    const owner = projectGameState(state, "seat-1");
    const opponent = projectGameState(state, "seat-2");
    const counterId = state.counterbidSlots["seat-1"]![0]!;
    expect(owner.seats[0]?.reserve).not.toBeNull();
    expect(owner.seats[1]?.reserve).toBeNull();
    expect(opponent.seats[0]?.scoringCardId).toBeNull();
    expect(owner.bids.find((bid) => bid.id === counterId)?.clout).toBe(3);
    expect(opponent.bids.find((bid) => bid.id === counterId)).toMatchObject({
      contestId: PARTY_IDS[0],
      clout: null,
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
    expect(state.seats[0]?.reserve.clout).toBe(20);
  });

  it("allows ready/unready, closes early when all ready, and enforces optional deadline", () => {
    let untimed = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      1_000
    );
    untimed = act(untimed, {
      type: "set_counterbid_ready",
      seatId: "seat-1",
      ready: true
    });
    expect(untimed.phase).toMatchObject({
      type: "counterbidding",
      readySeatIds: ["seat-1"]
    });
    untimed = act(untimed, {
      type: "set_counterbid_ready",
      seatId: "seat-1",
      ready: false
    });
    expect(untimed.phase).toMatchObject({ readySeatIds: [] });
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
    timed = act(timed, { type: "expire_counterbids", now: 11_000 });
    expect(timed).toMatchObject({ round: 2, phase: { type: "opening" } });
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
    expect(tied.seats.map((seat) => seat.reserve.clout)).toEqual([20, 20]);

    let revolved = submitAllOpenings(
      initializeGame(configuration(2, null), zeroRandom).state,
      0
    );
    revolved = setBid(revolved, "seat-2", 0, contestId, 2);
    revolved = readyAll(revolved);
    expect(revolved.seats.map((seat) => seat.reserve.clout)).toEqual([21, 19]);
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
      bid: {
        contestId: "pecking-order",
        firmId: seatTwo.firmIds[0]!,
        clout: 0,
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
            destinationDistrictId: "bellwether-centre"
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
    expect(state.overtures["night-parliament"]).toBe("foxglove");
    expect(state.phase.type).toBe("opening");
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
        clout: 2,
        operations: operations({ court: 1 }),
        points: 3
      }
    });
    expect(state.chat[0]).toMatchObject({ text: "Your move.", sentAt: 42 });
    expect(state.seats.map((seat) => seat.reserve.points)).toEqual([7, 13]);
    expect(state.seats.map((seat) => seat.reserve.clout)).toEqual([18, 22]);
    expect(() =>
      act(state, {
        type: "give_resources",
        seatId: "seat-1",
        recipientSeatId: "seat-2",
        resources: {
          clout: 0,
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
            ready: true
          },
          events
        ));
      } else if (state.phase.type === "election") {
        ({ state } = executeAndRecord(
          state,
          createElectionAction(state, zeroRandom),
          events
        ));
      } else {
        throw new Error(`Unexpected pending phase: ${state.phase.type}`);
      }
    }

    expect(state.round).toBe(12);
    expect(state.electionNumber).toBe(3);
    expect(state.phase.winnerSeatIds.length).toBeGreaterThan(0);
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
  clout: number,
  operationInventory = operations()
) {
  return { firmId, partyId, clout, operations: operationInventory };
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
  const count = Math.min(seat.firmIds.length, seat.reserve.clout);
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
  clout: number
): GameState {
  const seat = state.seats.find((candidate) => candidate.id === seatId)!;
  return act(state, {
    type: "set_counterbid",
    seatId,
    slotIndex,
    bid: {
      contestId,
      firmId: seat.firmIds[0]!,
      clout,
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
      ready: true
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
