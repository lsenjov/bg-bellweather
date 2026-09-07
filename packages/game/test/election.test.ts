import { describe, expect, it } from "vitest";
import { DISTRICTS, PARTY_IDS, SCORING_CARDS_BY_ID, type RegionId } from "@bellweather/content";
import {
  determineWinners, finalCardRankBonuses, recordElectionDraws, retainElectionSupport,
  relativeSeatIndex, scoreCapital, scoreCard, scoreElectionDay, toElectionScoringCard,
  type ElectionPlayer, type RecordedDistrictDraw, type ScoringCard
} from "../src/election.js";
import type { DistrictState, OperationState, Party } from "../src/operations.js";

function targets(): OperationState["coalitionTargets"] {
  return Object.fromEntries(PARTY_IDS.map((p) => [p, null])) as OperationState["coalitionTargets"];
}
function agenda(parties: Party[] = ["honeycomb", "old-shell", "foxglove"]): ScoringCard {
  return { id: "test", objectives: (["urban", "mixed", "outlying"] as RegionId[]).map((regionId, i) => ({ regionId, party: parties[i]! })), positiveSeat: "left", negativeSeat: "right" };
}
function draws(totals: number[]): Record<string, RecordedDistrictDraw> {
  const result = Object.fromEntries(DISTRICTS.filter((d) => d.regionId !== null).map((d) => [d.id, { districtId: d.id, parties: [] as Party[] }]));
  for (const [index, objective] of agenda().objectives.entries()) {
    let remaining = totals[index]!;
    for (const district of DISTRICTS.filter((d) => d.regionId === objective.regionId)) {
      const count = Math.min(remaining, district.capacity / 2);
      result[district.id]!.parties = Array.from({ length: count }, () => objective.party);
      remaining -= count;
    }
  }
  return result;
}
function state(totals: number[]): OperationState {
  const elected = draws(totals);
  return {
    districts: Object.fromEntries(DISTRICTS.map((d) => [d.id, { id: d.id, capacity: d.capacity, neighbors: d.adjacentDistrictIds, support: Object.fromEntries(PARTY_IDS.map((p) => [p, elected[d.id]?.parties.filter((v) => v === p).length ?? 0])) }])),
    courtSupport: Object.fromEntries(PARTY_IDS.map((p) => [p, {}])) as OperationState["courtSupport"], coalitionTargets: targets()
  };
}
function players(count: number): ElectionPlayer[] {
  return Array.from({ length: count }, (_, position) => ({ id: `p${position}`, position, points: 5, cards: [agenda()], capitalCard: agenda(), finalCardCount: position }));
}

describe("regional election scoring", () => {
  it.each([[4, 6, 7, 6], [4, 6, 6, 6], [0, 0, 9, 0], [3, 3, 3, 3], [9, 2, 4, 4]])("scores the middle total from %i/%i/%i", (a, b, c, expected) => {
    expect(scoreCard(agenda(), draws([a, b, c]), targets())).toBe(expected);
  });
  it("aggregates across districts and includes reciprocal coalition Support", () => {
    const result = draws([4, 6, 7]);
    result.harbormouth!.parties = ["many-wings", "many-wings", "many-wings"];
    const coalition = targets(); coalition.honeycomb = "many-wings";
    expect(scoreCard(agenda(), result, coalition)).toBe(6);
    result.northgate!.parties = ["many-wings", "many-wings", "many-wings"];
    coalition["old-shell"] = "many-wings";
    expect(scoreCard(agenda(), result, coalition)).toBe(3);
    coalition["many-wings"] = "old-shell";
    expect(scoreCard(agenda(), result, coalition)).toBe(6);
  });
  it("adds each low-player card's middle score separately and uses only the first Capital card", () => {
    const game = state([4, 6, 7]);
    game.districts["bellweather-centre"]!.support = { honeycomb: 1, "old-shell": 1, foxglove: 1 };
    const seats = players(2);
    seats[0]!.cards.push(agenda(["old-shell", "foxglove", "honeycomb"]));
    const result = scoreElectionDay({ state: game, players: seats, random: () => 0, finalElection: false });
    expect(result.scores[0]).toMatchObject({ baseRegionScore: 6, seatModifier: 0, capitalScore: 3, pointsChange: 9 });
    expect(game.districts["bellweather-centre"]!.support).toEqual({ honeycomb: 1, "old-shell": 1, foxglove: 1 });
  });
  it("takes two independent medians rather than a median of combined regional scores", () => {
    const game = state([4, 4, 0]);
    const second = agenda(["old-shell", "foxglove", "honeycomb"]);
    for (const [i, objective] of second.objectives.entries()) {
      let remaining = [0, 4, 4][i]!;
      for (const district of DISTRICTS.filter((d) => d.regionId === objective.regionId)) {
        const support = game.districts[district.id]!.support;
        const count = Math.min(remaining, district.capacity / 2 - Object.values(support).reduce((a, b) => a + b, 0));
        support[objective.party] = (support[objective.party] ?? 0) + count;
        remaining -= count;
      }
      expect(remaining).toBe(0);
    }
    const seats = players(2); seats[0]!.cards.push(second);
    const result = scoreElectionDay({ state: game, players: seats, random: () => 0, finalElection: false });
    expect(result.scores[0]!.baseRegionScore).toBe(8);
  });

  it("uses middle base scores for gain/lose, without including Capital or hand rank", () => {
    const game = state([4, 6, 7]);
    const seats = players(4);
    seats[1]!.cards = [agenda(["old-shell", "foxglove", "honeycomb"])];
    const result = scoreElectionDay({ state: game, players: seats, random: () => 0, finalElection: true });
    expect(result.scores[0]).toMatchObject({ baseRegionScore: 6, seatModifier: 6, finalCardRankBonus: 0, pointsChange: 12 });
    expect(result.scores[1]).toMatchObject({ baseRegionScore: 0, seatModifier: 0, finalCardRankBonus: 1 });
  });
  it("adapts the deck's region objectives", () => {
    expect(toElectionScoringCard(SCORING_CARDS_BY_ID["SC-01"]).objectives).toEqual(agenda().objectives);
  });
  it("rejects missing region draws and malformed cards", () => {
    expect(() => scoreCard(agenda(), {}, targets())).toThrow("Missing recorded draw");
    expect(() => scoreCard({ ...agenda(), objectives: [] }, draws([1, 2, 3]), targets())).toThrow("one objective per region");
  });
});

describe("district draws and retained bonuses", () => {
  it("draws locally without replacement, thins districts, and preserves Centre", () => {
    const game = state([0, 0, 0]);
    game.districts.harbormouth!.support = { honeycomb: 4, foxglove: 2 };
    game.districts.coast!.support = { foxglove: 3, riverworks: 1 };
    game.districts.westfield!.support = { "many-wings": 2 };
    game.districts["bellweather-centre"]!.support = { honeycomb: 2, foxglove: 1 };
    const result = recordElectionDraws(game.districts, () => 0);
    expect(result.harbormouth!.parties).toEqual(["honeycomb", "honeycomb", "honeycomb"]);
    expect(result.coast!.parties).toHaveLength(2); expect(result.westfield!.parties).toHaveLength(1);
    expect(result["bellweather-centre"]).toBeUndefined();
    const retained = retainElectionSupport(game.districts, result);
    expect(retained.harbormouth).toEqual({ honeycomb: 3 });
    expect(retained["bellweather-centre"]).toEqual(game.districts["bellweather-centre"]!.support);
    expect(() => recordElectionDraws(game.districts, () => 1)).toThrow();
  });
  it.each([[{}, 0], [{ honeycomb: 2 }, 0], [{ honeycomb: 1, foxglove: 1 }, 1], [{ honeycomb: 1, foxglove: 1, "old-shell": 1 }, 3]])("keeps Capital presence scoring", (support, expected) => {
    expect(scoreCapital(agenda(), { id: "bellweather-centre", capacity: 3, neighbors: [], support } as DistrictState).score).toBe(expected);
  });
  it("retains tied final hand ranks and shared winners", () => {
    const seats = players(4); seats[0]!.finalCardCount = 2;
    expect([...finalCardRankBonuses(seats).values()]).toEqual([2, 0, 2, 3]);
    expect(determineWinners(seats)).toEqual(seats.map((p) => p.id));
    expect(relativeSeatIndex(0, 4, "left")).toBe(3);
    expect(relativeSeatIndex(0, 4, "second-right")).toBe(2);
  });
});
