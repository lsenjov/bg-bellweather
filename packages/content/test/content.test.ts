import { describe, expect, it } from "vitest";
import {
  BONUS_CARDS,
  BONUS_CARD_IDS,
  DISTRICTS,
  DISTRICTS_BY_ID,
  DISTRICT_IDS,
  DOUBLED_PLAYER_SETUP,
  ELECTION_YEARS,
  FIRMS,
  FIRM_IDS,
  INITIAL_SUPPORT_DISTRICTS,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  PARTY_IDS,
  SCORING_CARDS,
  SCORING_CARD_IDS,
  REGION_IDS,
  scoringCardsCompatible,
  SEAT_REFERENCES,
  STANDARD_PLAYER_SETUP,
  SUPPORT_SUPPLY,
  type DistrictId,
  type PartyId,
  type SeatReference
} from "../src/index.js";

function frequencies<T extends string>(values: readonly T[]): Map<T, number> {
  const result = new Map<T, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

describe("district map", () => {
  it("matches the committed topology exactly", () => {
    const edges = DISTRICTS.flatMap((district) =>
      district.adjacentDistrictIds
        .filter((adjacentId) => district.id < adjacentId)
        .map((adjacentId) => `${district.id}:${adjacentId}`)
    ).sort();

    expect(edges).toHaveLength(23);
    expect(DISTRICTS_BY_ID["bellweather-centre"].adjacentDistrictIds).toEqual(["ironwood", "canal-ward", "westfield", "downs"]);
    expect(DISTRICTS_BY_ID.harbormouth.adjacentDistrictIds).toEqual(["grand-market", "ironwood"]);
  });

  it("contains the complete capacity-57, 23-connection map", () => {
    expect(DISTRICTS).toHaveLength(16);
    expect(new Set(DISTRICT_IDS).size).toBe(16);
    expect(DISTRICTS.reduce((total, district) => total + district.capacity, 0)).toBe(
      57
    );
    expect(
      DISTRICTS.reduce(
        (total, district) => total + district.adjacentDistrictIds.length,
        0
      ) / 2
    ).toBe(23);
  });

  it("has only known, symmetric, non-self adjacencies", () => {
    for (const district of DISTRICTS) {
      expect(new Set(district.adjacentDistrictIds).size).toBe(
        district.adjacentDistrictIds.length
      );
      for (const adjacentId of district.adjacentDistrictIds) {
        expect(adjacentId).not.toBe(district.id);
        expect(DISTRICTS_BY_ID[adjacentId].adjacentDistrictIds).toContain(
          district.id
        );
      }
    }
  });
});

describe("parties and firms", () => {
  it("defines six distinct parties and all unique operation pairs", () => {
    expect(PARTIES).toHaveLength(6);
    expect(new Set(PARTY_IDS).size).toBe(6);
    expect(
      new Set(
        PARTIES.map((party) => [...party.favoredOperations].sort().join("+"))
      ).size
    ).toBe(6);

    const favoredCounts = frequencies(
      PARTIES.flatMap((party) => party.favoredOperations)
    );
    for (const operation of OPERATION_IDS) {
      expect(favoredCounts.get(operation)).toBe(3);
    }
  });

  it("gives each party two preferred-Operation cards and one Unbound card", () => {
    expect(BONUS_CARDS).toHaveLength(18);
    expect(new Set(BONUS_CARD_IDS).size).toBe(18);
    for (const party of PARTIES) {
      expect(party.bonusCards.map((card) => card.operation)).toEqual([
        ...party.favoredOperations,
        null
      ]);
      expect(party.bonusCards.every((card) => card.homePartyId === party.id)).toBe(true);
    }
  });

  it("defines Quiet Hours as Night Parliament's Rally Bonus card", () => {
    expect(PARTIES_BY_ID["night-parliament"].bonusCards[0]).toMatchObject({
      id: "night-parliament-quiet-hours",
      homePartyId: "night-parliament",
      operation: "rally",
      name: "Quiet Hours",
      effect:
        "Resolve Rally for the acting party, then add acting-party Support to an otherwise empty district."
    });
  });

  it("defines six distinct, sequentially numbered firms", () => {
    expect(FIRMS).toHaveLength(6);
    expect(new Set(FIRM_IDS).size).toBe(6);
    expect(FIRMS.map((firm) => firm.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("scoring deck", () => {
  it("contains the exact 24 stable card IDs", () => {
    expect(SCORING_CARDS).toHaveLength(24);
    expect(SCORING_CARDS.map((card) => card.id)).toEqual(SCORING_CARD_IDS);
    expect(new Set(SCORING_CARD_IDS).size).toBe(24);
  });

  it("assigns a different party to each region and allows only non-overlapping pairs", () => {
    for (const card of SCORING_CARDS) {
      expect(card.objectives.map((o) => o.regionId)).toEqual(REGION_IDS);
      expect(new Set(card.objectives.map((o) => o.partyId)).size).toBe(3);
      expect(scoringCardsCompatible(card, card)).toBe(false);
    }
    expect(scoringCardsCompatible(SCORING_CARDS[0], SCORING_CARDS[1])).toBe(true);
    expect(scoringCardsCompatible(SCORING_CARDS[0], SCORING_CARDS[6])).toBe(false);
  });

  it("matches the district and party distribution", () => {
    for (const regionId of REGION_IDS) {
      expect(DISTRICTS.filter((d) => d.regionId === regionId).reduce((n, d) => n + d.capacity, 0)).toBe(18);
    }
    expect(DISTRICTS_BY_ID.coast.capacity).toBe(4);
    expect(DISTRICTS_BY_ID.westfield.capacity).toBe(2);

    const allPartyCounts = frequencies(
      SCORING_CARDS.flatMap((card) =>
        card.objectives.map((objective) => objective.partyId)
      )
    );
    for (const partyId of PARTY_IDS) {
      expect(allPartyCounts.get(partyId)).toBe(12);
      for (const line of [0, 1, 2] as const) {
        expect(
          SCORING_CARDS.filter(
            (card) => card.objectives[line].partyId === partyId
          )
        ).toHaveLength(4);
      }
    }
  });

  it("balances all positive and negative relative-seat references", () => {
    const gains = frequencies(
      SCORING_CARDS.map((card) => card.gain as SeatReference)
    );
    const losses = frequencies(
      SCORING_CARDS.map((card) => card.lose as SeatReference)
    );
    for (const reference of SEAT_REFERENCES) {
      expect(gains.get(reference)).toBe(6);
      expect(losses.get(reference)).toBe(6);
    }
    for (const card of SCORING_CARDS) {
      expect(card.gain).not.toBe(card.lose);
      expect(new Set([card.gain, card.lose])).not.toEqual(
        new Set(["second-left", "second-right"])
      );
    }
  });
});

describe("setup constants", () => {
  it("freezes exported content recursively", () => {
    expect(Object.isFrozen(DISTRICTS)).toBe(true);
    expect(Object.isFrozen(DISTRICTS[0])).toBe(true);
    expect(Object.isFrozen(DISTRICTS[0].adjacentDistrictIds)).toBe(true);
    expect(Object.isFrozen(PARTIES[0].bonusCards[0])).toBe(true);
    expect(Object.isFrozen(SCORING_CARDS[0].objectives[0])).toBe(true);
    expect(Object.isFrozen(STANDARD_PLAYER_SETUP.operations)).toBe(true);
  });

  it("doubles firms, Operations, points, and Collection counters at two or three players", () => {
    expect(STANDARD_PLAYER_SETUP.operations.organise).toBe(3);
    expect(STANDARD_PLAYER_SETUP.operations.court).toBe(2);
    expect(DOUBLED_PLAYER_SETUP.firms).toBe(
      STANDARD_PLAYER_SETUP.firms * 2
    );
    expect(DOUBLED_PLAYER_SETUP.points).toBe(
      STANDARD_PLAYER_SETUP.points * 2
    );
    expect(DOUBLED_PLAYER_SETUP.collectionCounters).toBe(
      STANDARD_PLAYER_SETUP.collectionCounters * 2
    );
    for (const operation of OPERATION_IDS) {
      expect(DOUBLED_PLAYER_SETUP.operations[operation]).toBe(
        STANDARD_PLAYER_SETUP.operations[operation] * 2
      );
    }
  });

  it("starts every party in the three large districts with unlimited supply", () => {
    expect(INITIAL_SUPPORT_DISTRICTS).toEqual([
      "harbormouth",
      "grand-market",
      "ironwood"
    ] satisfies readonly DistrictId[]);
    for (const districtId of INITIAL_SUPPORT_DISTRICTS) {
      expect(DISTRICTS_BY_ID[districtId].capacity).toBe(6);
    }
    expect(SUPPORT_SUPPLY).toBe("unlimited");
    expect(PARTIES.length * INITIAL_SUPPORT_DISTRICTS.length).toBe(18);
  });

  it("holds elections after years 2, 4, and 6", () => {
    expect(ELECTION_YEARS).toEqual([2, 4, 6]);
  });
});

it("keeps typed content identifiers assignable", () => {
  const district: DistrictId = DISTRICT_IDS[0];
  const party: PartyId = PARTY_IDS[0];

  expect({ district, party }).toEqual({
    district: "harbormouth",
    party: "honeycomb"
  });
});
