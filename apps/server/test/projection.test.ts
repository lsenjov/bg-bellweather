import { initializeGame, type BidState, type GameState } from "@bellweather/game";
import { describe, expect, it } from "vitest";
import { publicResolutionFilingProgress } from "../src/projection.js";

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
    bid("future-bid", "honeycomb", firmId, "active")
  ];
  state.bids = Object.fromEntries(bids.map((entry) => [entry.id, entry]));
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
      bidIds: ["zero-operation-bid", "current-bid", "future-bid"]
    }
  };
  state.phase = {
    type: "resolution",
    contestOrder: ["pecking-order", "honeycomb"],
    contestIndex: 1,
    contestPrepared: true,
    executionBidIds: ["zero-operation-bid", "current-bid", "future-bid"],
    bidIndex: 1,
    remainingOperations: {
      "zero-operation-bid": operations(),
      "current-bid": operations({ organise: 1 }),
      "future-bid": operations({ rally: 1 })
    },
    pendingDecision: {
      id: "decision-current",
      kind: "party_operation",
      seatId: "seat-1",
      contestId: "honeycomb",
      bidId: "current-bid",
      partyId: "honeycomb",
      legalOperations: ["organise"]
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
