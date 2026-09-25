import { describe, expect, it } from "vitest";
import { DISTRICTS, POLICIES, POLICIES_BY_ID, partyLawEffects, type PartyId, type PolicyId } from "@bellwether/content";
import { initializeGame, createElectionAction, executeAction, projectGameState, replay, toOperationState } from "../src/index.js";
import { scoreElectionDay } from "../src/election.js";
import { resolveOperation } from "../src/operations.js";

const random = { integer: () => 0 };
function fresh() {
  const state = initializeGame({ seats: ["a", "b"].map(id => ({ id, displayName: id, controller: "human" as const })) }, random).state;
  for (const district of DISTRICTS) state.support[district.id] = {};
  return state;
}
function vote(policyId: PolicyId, support: Partial<Record<PartyId, number>>) {
  const state = fresh();
  state.pendingPolicies.centre = policyId;
  state.support["bellwether-centre"] = support;
  return scoreElectionDay({ state: toOperationState(state), pendingPolicies: state.pendingPolicies, enactedPolicyIds: [], players: [], random: () => 0, finalElection: false }).policyVotes.find(v => v.regionId === "centre")!;
}

describe("permanent Party laws", () => {
  it("breaks recipient ties using printed order rather than the general party order", () => {
    expect(POLICIES_BY_ID.P03.forPartyIds).toEqual(["night-parliament", "honeycomb", "riverworks"]);
    expect(vote("P03", { honeycomb: 1, "night-parliament": 1 })).toMatchObject({ passed: true, recipientPartyId: "night-parliament" });
    expect(vote("P03", { honeycomb: 2, "night-parliament": 1 }).recipientPartyId).toBe("honeycomb");
  });

  it("awards only passed Party policies, excluding Against voters", () => {
    expect(vote("P03", { honeycomb: 1, "night-parliament": 1, foxglove: 1 }).recipientPartyId).toBe("night-parliament");
    expect(vote("P03", { honeycomb: 1, foxglove: 1 })).toMatchObject({ passed: false, recipientPartyId: null });
    expect(vote("P03", {}).recipientPartyId).toBeNull();
    expect(vote("P04", { foxglove: 3 })).toMatchObject({ passed: true, recipientPartyId: null });
  });

  it("uses surviving votes and persists the award through projection and replay", () => {
    const state = fresh();
    state.pendingPolicies.urban = "P03";
    state.support.harbormouth = { honeycomb: 2, "night-parliament": 4 };
    state.phase = { type: "election", electionNumber: 1, afterYear: 2, resultsRecorded: false, readySeatIds: [] };
    const result = executeAction(state, createElectionAction(state, random));
    expect(result.state.policyRecipients.P03).toBe("honeycomb");
    expect(result.state.electionHistory[0]!.policyVotes[0]).toMatchObject({ partyVotes: { honeycomb: 2, "night-parliament": 1 }, recipientPartyId: "honeycomb" });
    expect(replay([{ type: "game_initialized", state }, ...result.events])).toEqual(result.state);
    const view = projectGameState(result.state, null);
    expect(view.policyRecipients.P03).toBe("honeycomb");
    view.policyRecipients.P03 = "foxglove";
    expect(result.state.policyRecipients.P03).toBe("honeycomb");
    for (const district of DISTRICTS) result.state.support[district.id] = {};
    expect(toOperationState(result.state).laws.honeycomb).toContain(35);
    expect(toOperationState(result.state).laws.foxglove).not.toContain(35);
  });

  it("deduplicates effects per recipient without sharing them with other parties", () => {
    const copies = POLICIES.filter(policy => policy.effect === 6).map(policy => policy.id);
    expect(partyLawEffects(copies, { [copies[0]!]: "honeycomb", [copies[1]!]: "honeycomb" }, "honeycomb")).toEqual([6]);
    const recipients = { [copies[0]!]: "honeycomb", [copies[1]!]: "foxglove" } as const;
    expect(partyLawEffects(copies, recipients, "honeycomb")).toEqual([6]);
    expect(partyLawEffects(copies, recipients, "foxglove")).toEqual([6]);
    expect(partyLawEffects(copies, recipients, "riverworks")).toEqual([]);
  });

  it("applies the acting party's law to an off-home Bonus, never the home party's law", () => {
    const state = fresh();
    state.enactedPolicyIds = ["P26"];
    state.policyRecipients.P26 = "honeycomb";
    state.support.harbormouth = { honeycomb: 2, "old-shell": 2 };
    const request = { party: "honeycomb" as const, bonusCardId: "old-shell-dig-in" as const, choice: { operation: "organise" as const, sourceDistrictId: "harbormouth", destinationDistrictId: "grand-market", count: 2 } };
    expect(resolveOperation(toOperationState(state), request).baselineApplied).toBe(true);
    expect(resolveOperation(toOperationState(state), { ...request, party: "old-shell" }).baselineApplied).toBe(false);
    state.policyRecipients.P26 = "old-shell";
    expect(resolveOperation(toOperationState(state), request).baselineApplied).toBe(false);
  });

  it("does not trigger a displaced rival's laws", () => {
    const state = fresh();
    state.enactedPolicyIds = ["P08", "P13"];
    state.policyRecipients = { P08: "honeycomb", P13: "foxglove" };
    state.support.harbormouth = { honeycomb: 1 };
    state.support["grand-market"] = { foxglove: 1 };
    const result = resolveOperation(toOperationState(state), { party: "honeycomb", choice: { operation: "smear", districtId: "grand-market", rivalParty: "foxglove", displacementDistrictId: "bellwether-centre" } });
    expect(result.baselineApplied).toBe(true);
    expect(result.state.districts["bellwether-centre"]!.support).toEqual({ foxglove: 1 });
    expect(result.supportChanges).toHaveLength(1);
  });

  it("combines endpoint region extras once and skips a full destination", () => {
    const state = fresh();
    state.enactedPolicyIds = ["P11", "P13", "P15"];
    state.policyRecipients = { P11: "honeycomb", P13: "honeycomb", P15: "honeycomb" };
    state.support["grand-market"] = { honeycomb: 2 };
    const choice = { operation: "organise" as const, sourceDistrictId: "grand-market", destinationDistrictId: "crown-road", count: 2 };
    const result = resolveOperation(toOperationState(state), { party: "honeycomb", choice });
    expect(result.baselineApplied).toBe(true);
    expect(result.state.districts["grand-market"]!.support).toEqual({ honeycomb: 1 });
    expect(result.state.districts["crown-road"]!.support).toEqual({ honeycomb: 2 });
    expect(result.supportChanges).toHaveLength(3);
    const sameRegion = resolveOperation(toOperationState(state), { party: "honeycomb", choice: { ...choice, destinationDistrictId: "harbormouth" } });
    expect(sameRegion.supportChanges).toHaveLength(2);
  });
});
