import { initializeGame, type BidState, type GameState } from "@bellweather/game";
import { describe, expect, it } from "vitest";
import {
  publicEngineState,
  publicResolutionFilingProgress
} from "../src/projection.js";

describe("resolution filing projection", () => {
  it("marks passed and zero-operation filings complete without including cancellations", () => {
    const state = resolutionState();

    expect(
      publicResolutionFilingProgress(
        state,
        state.phase.type === "resolution"
          ? state.phase
          : assertResolutionPhase()
      )
    ).toEqual({
      currentContestId: "honeycomb",
      currentBidId: "current-bid",
      completedBidIds: ["prior-bid", "zero-operation-bid"]
    });
  });

  it("reopens a completed filing while its delayed decision is current", () => {
    const state = resolutionState();
    if (state.phase.type !== "resolution") {
      throw new Error("Expected resolution phase");
    }
    state.phase.bidIndex = state.phase.executionBidIds.length;
    state.phase.pendingDecision = {
      id: "decision-delayed",
      kind: "night_delayed_operation",
      seatId: "seat-1",
      contestId: "night-parliament",
      bidId: "zero-operation-bid",
      claimId: "claim-1",
      operation: "court"
    };

    expect(publicResolutionFilingProgress(state, state.phase)).toEqual({
      currentContestId: "honeycomb",
      currentBidId: "zero-operation-bid",
      completedBidIds: ["prior-bid", "current-bid", "future-bid"]
    });
    expect(
      projectedPendingDecision(publicEngineState(state)).availableOperations
    ).toEqual([{ operation: "court", count: 1 }]);
  });

  it("reveals completed and current contests while keeping future contests covered", () => {
    const projected = publicEngineState(resolutionState());
    const contests = projected.contests as Record<
      string,
      { bids: Array<Record<string, unknown>> }
    >;
    const priorBid = bidById(contests["pecking-order"]!, "cancelled-bid");
    const currentBid = bidById(contests.honeycomb!, "current-bid");
    const currentCancellation = bidById(
      contests.honeycomb!,
      "current-cancelled-bid"
    );
    const futureContestBid = bidById(
      contests["old-shell"]!,
      "unresolved-contest-bid"
    );

    expect(priorBid).toHaveProperty("operations");
    expect(currentBid).toMatchObject({
      bluff: 2,
      operations: { organise: 2, rally: 3, smear: 0, court: 0 }
    });
    expect(currentCancellation).toHaveProperty("operations");
    expect(futureContestBid).not.toHaveProperty("bluff");
    expect(futureContestBid).not.toHaveProperty("operations");
    expect(projectedPendingDecision(projected).availableOperations).toEqual([
      { operation: "organise", count: 1 },
      { operation: "rally", count: 3 }
    ]);
  });

  it("reveals every contest after resolution", () => {
    const state = resolutionState();
    state.phase = {
      type: "election",
      electionNumber: 1,
      afterRound: 4,
      resultsRecorded: true,
      readySeatIds: []
    };
    const contests = publicEngineState(state).contests as Record<
      string,
      { bids: Array<Record<string, unknown>> }
    >;

    expect(
      bidById(contests["old-shell"]!, "unresolved-contest-bid")
    ).toHaveProperty("operations");
  });
});

function resolutionState(): GameState {
  const state = initializeGame(
    {
      seats: [
        { id: "seat-1", displayName: "Ada", controller: "human" },
        { id: "seat-2", displayName: "Babbage", controller: "human" }
      ],
      counterbidTimerSeconds: null
    },
    { integer: () => 0 }
  ).state;
  const firmId = state.seats[0]!.firmIds[0]!;
  const bids = [
    bid("prior-bid", "pecking-order", firmId, "transferred"),
    bid("cancelled-bid", "pecking-order", firmId, "cancelled"),
    bid("zero-operation-bid", "honeycomb", firmId, "active"),
    bid("current-bid", "honeycomb", firmId, "active"),
    bid("future-bid", "honeycomb", firmId, "active"),
    bid("current-cancelled-bid", "honeycomb", firmId, "cancelled"),
    bid("unresolved-contest-bid", "old-shell", firmId, "active")
  ];
  state.bids = Object.fromEntries(bids.map((entry) => [entry.id, entry]));
  state.bids["current-bid"]!.bluff = 2;
  state.bids["current-bid"]!.operations = operations({
    organise: 2,
    rally: 3
  });
  state.bids["unresolved-contest-bid"]!.bluff = 3;
  state.bids["unresolved-contest-bid"]!.operations = operations({ smear: 2 });
  state.contests = {
    "pecking-order": {
      id: "pecking-order",
      targetPartyId: null,
      openingBidId: null,
      bidIds: ["prior-bid", "cancelled-bid"]
    },
    honeycomb: {
      id: "honeycomb",
      targetPartyId: "honeycomb",
      openingBidId: "zero-operation-bid",
      bidIds: [
        "zero-operation-bid",
        "current-bid",
        "future-bid",
        "current-cancelled-bid"
      ]
    },
    "old-shell": {
      id: "old-shell",
      targetPartyId: "old-shell",
      openingBidId: "unresolved-contest-bid",
      bidIds: ["unresolved-contest-bid"]
    }
  };
  state.phase = {
    type: "resolution",
    contestOrder: ["pecking-order", "honeycomb", "old-shell"],
    contestIndex: 1,
    contestPrepared: true,
    executionBidIds: ["zero-operation-bid", "current-bid", "future-bid"],
    bidIndex: 1,
    remainingOperations: {
      "zero-operation-bid": operations(),
      "current-bid": operations({ organise: 1, rally: 3 }),
      "future-bid": operations({ rally: 1 })
    },
    pendingDecision: {
      id: "decision-current",
      kind: "party_operation",
      seatId: "seat-1",
      contestId: "honeycomb",
      bidId: "current-bid",
      partyId: "honeycomb",
      legalOperations: ["organise", "rally"]
    },
    claimedBonuses: [],
    delayedBonusClaims: [],
    delayedClaimIndex: 0
  };
  return state;
}

function bid(
  id: string,
  contestId: BidState["contestId"],
  firmId: BidState["firmId"],
  status: BidState["status"]
): BidState {
  return {
    id,
    contestId,
    ownerSeatId: "seat-1",
    firmId,
    kind: "opening",
    slotIndex: null,
    status,
    transferredToSeatId: status === "transferred" ? "seat-1" : null,
    leverage: 1,
    bluff: 0,
    operations: operations()
  };
}

function operations(
  overrides: Partial<BidState["operations"]> = {}
): BidState["operations"] {
  return {
    organise: overrides.organise ?? 0,
    rally: overrides.rally ?? 0,
    smear: overrides.smear ?? 0,
    court: overrides.court ?? 0
  };
}

function assertResolutionPhase(): never {
  throw new Error("Expected resolution phase");
}

function bidById(
  contest: { bids: Array<Record<string, unknown>> },
  bidId: string
): Record<string, unknown> {
  const projectedBid = contest.bids.find((entry) => entry.id === bidId);
  if (projectedBid === undefined) {
    throw new Error(`Missing projected bid ${bidId}`);
  }
  return projectedBid;
}

function projectedPendingDecision(
  projected: Record<string, unknown>
): Record<string, unknown> {
  const phase = projected.phase as Record<string, unknown>;
  return phase.pendingDecision as Record<string, unknown>;
}
