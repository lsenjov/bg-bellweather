import { describe, expect, it } from "vitest";
import { PARTIES, PARTY_IDS, PARTY_PRIORITIES, POLICIES, PROMISE_CATEGORIES, SCORING_CARDS, LAW_EFFECTS, votesFor, DISTRICTS, DISTRICTS_BY_ID, REGION_IDS, MAP_BRIDGES, BONUS_CARDS, OPERATION_IDS, STANDARD_PLAYER_SETUP, DOUBLED_PLAYER_SETUP } from "../src/index.js";

describe("policy content", () => {
  it("contains every directed promise pair with opposite effects and balanced votes", () => {
    expect(POLICIES).toHaveLength(30);
    expect(new Set(POLICIES.map(p => `${p.plus}/${p.minus}`)).size).toBe(30);
    for (const policy of POLICIES) {
      expect(policy.plus).not.toBe(policy.minus);
      expect(PARTY_IDS.filter(id => votesFor(id, policy))).toHaveLength(3);
      expect(POLICIES.find(p => p.plus === policy.minus && p.minus === policy.plus)?.effect).not.toBe(policy.effect);
    }
    expect(LAW_EFFECTS).toHaveLength(15);
    for (const effect of LAW_EFFECTS) expect(POLICIES.filter(p => p.effect === effect.id)).toHaveLength(2);
  });
  it("balances party rankings and unique secret cards without party matches", () => {
    expect(SCORING_CARDS).toHaveLength(12);
    expect(new Set(SCORING_CARDS.map(c => c.order.join())).size).toBe(12);
    for (const order of Object.values(PARTY_PRIORITIES)) expect(Object.values(PARTY_PRIORITIES).some(o => o.join() === [...order].reverse().join())).toBe(true);
    for (const card of SCORING_CARDS) expect(Object.values(PARTY_PRIORITIES).some(o => o.join() === card.order.join())).toBe(false);
    for (const category of PROMISE_CATEGORIES) for (let rank = 0; rank < 6; rank++) {
      expect(SCORING_CARDS.filter(c => c.order[rank] === category)).toHaveLength(2);
      expect(Object.values(PARTY_PRIORITIES).filter(o => o[rank] === category)).toHaveLength(1);
    }
  });
  it("removes Court without redistributing its supply", () => {
    expect(OPERATION_IDS).toEqual(["organise", "rally", "smear"]);
    expect(STANDARD_PLAYER_SETUP.operations).toEqual({organise:3,rally:4,smear:2});
    expect(DOUBLED_PLAYER_SETUP.operations).toEqual({organise:6,rally:8,smear:4});
    expect(STANDARD_PLAYER_SETUP.points).toBe(0);
    expect(DOUBLED_PLAYER_SETUP.points).toBe(0);
    expect(BONUS_CARDS).toHaveLength(18);
    for (const party of PARTIES) expect(party.bonusCards).toHaveLength(3);
    expect(BONUS_CARDS.some(c => c.effect.includes("Court"))).toBe(false);
  });
  it("preserves topology with Centre as a fourth capacity-three region", () => {
    expect(REGION_IDS).toEqual(["urban", "mixed", "outlying", "centre"]);
    expect(DISTRICTS_BY_ID["bellwether-centre"]).toMatchObject({regionId:"centre",capacity:3});
    expect(DISTRICTS.reduce((n,d)=>n+d.capacity,0)).toBe(57);
    expect(DISTRICTS.reduce((n,d)=>n+d.adjacentDistrictIds.length,0)).toBe(46);
    expect(MAP_BRIDGES).toHaveLength(9);
    for (const d of DISTRICTS) for (const neighbor of d.adjacentDistrictIds) expect(DISTRICTS_BY_ID[neighbor].adjacentDistrictIds).toContain(d.id);
  });
});
