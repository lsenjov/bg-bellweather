import { describe, expect, it } from "vitest";
import { POLICIES } from "@bellwether/content";
import { chooseLobbyAction } from "../playtest-actions.js";

describe("playtest agent Lobby action selection", () => {
  const blockedRallyGame = {
    parties: {
      honeycomb: {
        ownerSeatId: "seat-1",
        status: "open"
      }
    },
    bonusCardsAtParties: {honeycomb:["honeycomb-common-cause"]},
    support: {
      harbormouth: {
        honeycomb: 6
      }
    }
  };
  const ownSeat = {
    collectionCounters: 2,
    operations: {
      rally: 1
    }
  };

  it("supplies Fresh Start's mandatory second placement for an absent party", () => {
    const action = chooseLobbyAction({parties:{honeycomb:{status:"open"}}, support:{}, enactedPolicyIds:[POLICIES.find(policy => policy.effect === 6)!.id]}, ownSeat, {turnsTaken:{"seat-1":0}}, "seat-1");
    expect(action).toMatchObject({type:"operate",play:{choice:{operation:"rally",freshStartDistrictId:expect.any(String)}}});
  });

  it("collects on the first turn when Rally is blocked and Close is unavailable", () => {
    expect(
      chooseLobbyAction(
        blockedRallyGame,
        ownSeat,
        { turnsTaken: { "seat-1": 0 } },
        "seat-1"
      )
    ).toEqual({ type: "collect", partyId: "honeycomb", bonusCardId:"honeycomb-common-cause" });
  });

  it("closes its own party before spending a Collection counter", () => {
    expect(
      chooseLobbyAction(
        blockedRallyGame,
        ownSeat,
        { turnsTaken: { "seat-1": 1 } },
        "seat-1"
      )
    ).toEqual({ type: "close", partyId: "honeycomb", bonusCardId:"honeycomb-common-cause" });
  });

  it("passes only when no open party it owns remains", () => {
    expect(
      chooseLobbyAction(
        {
          parties: {
            honeycomb: {
              ownerSeatId: "seat-2",
              status: "open"
            }
          },
          support: {}
        },
        { collectionCounters: 0, operations: { rally: 0 } },
        { turnsTaken: { "seat-1": 1 } },
        "seat-1"
      )
    ).toEqual({ type: "pass" });
  });
});
