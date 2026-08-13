import { describe, expect, it } from "vitest";
import {
  executeAction,
  initializeGame,
  type GameAction,
  type GameState
} from "@bellweather/game";
import {
  projectEvent,
  publicEngineState,
  seatEngineState
} from "../src/projection.js";
import type { StoredEvent } from "../src/types.js";

const random = { integer: () => 0 };

describe("yearly game projections", () => {
  it("shows public counts while keeping hands, New Year cards, and scoring cards private", () => {
    const state = initializeGame(configuration(), random).state;
    state.seats[0]!.newYearOperations.rally = 2;

    const publicView = publicEngineState(state);
    const publicSeats = publicView.seats as Array<Record<string, unknown>>;
    expect(publicSeats[0]).toMatchObject({
      handCount: 10,
      newYearCardCount: 2,
      operations: null,
      newYearOperations: null,
      scoringCardIds: null
    });

    const privateView = seatEngineState(state, "seat-1");
    expect(privateView.seat).toMatchObject({
      id: "seat-1",
      operations: { organise: 2, rally: 4, smear: 2, court: 2 },
      newYearOperations: { organise: 0, rally: 2, smear: 0, court: 0 }
    });
  });

  it("shows the exact public Operation pile and claimed party bonus", () => {
    let state = openEveryParty(initializeGame(configuration(), random).state);
    state = apply(state, {
      type: "operate",
      seatId: "seat-1",
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

    const parties = publicEngineState(state).parties as Record<
      string,
      Record<string, unknown>
    >;
    expect(parties.honeycomb).toMatchObject({
      ownerSeatId: "seat-1",
      status: "open",
      operations: { organise: 1, rally: 0, smear: 0, court: 0 },
      claimedBonuses: ["organise"]
    });
  });

  it("projects actions without exposing election random values", () => {
    const actionEvent = event({
      engineEvents: [{
        type: "action_applied",
        action: {
          type: "operate",
          seatId: "seat-1",
          partyId: "honeycomb",
          play: {
            operation: "rally",
            choice: { operation: "rally", districtId: "cloverfield" },
            claimBonus: true
          }
        }
      }]
    });
    expect(projectEvent(actionEvent, undefined, false)).toMatchObject({
      scope: "public",
      publicData: {
        actions: [{
          type: "operate",
          seatId: "seat-1",
          partyId: "honeycomb",
          operation: "rally",
          claimBonus: true
        }]
      }
    });

    const electionEvent = event({
      engineEvents: [{
        type: "action_applied",
        action: { type: "complete_election", randomValues: [0, 1, 2] }
      }]
    });
    expect(projectEvent(electionEvent, undefined, false)).toMatchObject({
      publicData: { actions: [{ type: "complete_election" }] }
    });
    expect(JSON.stringify(projectEvent(electionEvent, undefined, false))).not.toContain(
      "randomValues"
    );
  });
});

function configuration() {
  return {
    seats: ["Ada", "Bert", "Cleo", "Dara"].map((displayName, index) => ({
      id: `seat-${index + 1}`,
      displayName,
      controller: "human" as const
    }))
  };
}

function openEveryParty(initial: GameState): GameState {
  let state = initial;
  while (state.phase.type === "opening") {
    const seatId = state.phase.turnSeatIds[state.phase.turnIndex]!;
    const seat = state.seats.find((candidate) => candidate.id === seatId)!;
    const partyId = ([
      "honeycomb",
      "old-shell",
      "foxglove",
      "riverworks"
    ] as const)[state.phase.turnIndex]!;
    state = apply(state, {
      type: "open_party",
      seatId,
      firmId: seat.firmIds[0]!,
      partyId
    });
  }
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  return executeAction(state, action).state;
}

function event(payload: unknown): StoredEvent {
  return {
    gameId: "018f47d2-7830-7b84-a854-1b741f285f5d",
    version: 2,
    id: "018f47d2-7830-7b84-a854-1b741f285f5f",
    type: "game.action_applied",
    payload,
    actorSeatId: "seat-1",
    visibility: "public",
    privateSeatId: null,
    occurredAt: "2026-08-13T00:00:00.000Z",
    schemaVersion: 1
  };
}
