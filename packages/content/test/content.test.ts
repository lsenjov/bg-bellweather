import { describe, expect, it } from "vitest";
import {
  DISTRICTS,
  DISTRICTS_BY_ID,
  DISTRICT_IDS,
  DOUBLED_PLAYER_SETUP,
  ELECTION_ROUNDS,
  FIRMS,
  FIRM_IDS,
  INITIAL_SUPPORT_DISTRICTS,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  PARTY_IDS,
  SCORING_CARDS,
  SCORING_CARD_IDS,
  SCORING_CARD_PAIRS,
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

    expect(edges).toEqual([
      "bellweather-centre:canal-ward",
      "bellweather-centre:crown-road",
      "bellweather-centre:old-quarter",
      "canal-ward:reedwater",
      "cloverfield:harbormouth",
      "cloverfield:northreach",
      "crown-road:northreach",
      "grand-market:red-orchard",
      "grand-market:sunmeadow",
      "harbormouth:millbank",
      "high-pastures:ironwood",
      "high-pastures:northreach",
      "ironwood:mossfield",
      "millbank:reedwater",
      "mossfield:westgate",
      "old-quarter:westgate",
      "red-orchard:westgate",
      "reedwater:sunmeadow"
    ].sort());
  });

  it("contains the complete capacity-57, 18-border map", () => {
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
    ).toBe(18);
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

  it("gives each party exactly one matching bonus per favored operation", () => {
    for (const party of PARTIES) {
      expect(party.bonuses.map((bonus) => bonus.operation)).toEqual(
        party.favoredOperations
      );
    }
  });

  it("keeps only Night Shift delayed", () => {
    expect(
      PARTIES_BY_ID["night-parliament"].bonuses.map((bonus) => bonus.timing)
    ).toEqual([
      "delayed",
      "immediate"
    ]);
  });

  it("defines six distinct, sequentially numbered firms", () => {
    expect(FIRMS).toHaveLength(6);
    expect(new Set(FIRM_IDS).size).toBe(6);
    expect(FIRMS.map((firm) => firm.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("scoring deck", () => {
  it("matches every committed objective and seat reference", () => {
    expect(
      SCORING_CARDS.map((card) =>
        [
          card.id,
          ...card.objectives.map(
            (objective) => `${objective.districtId}/${objective.partyId}`
          ),
          `+${card.gain}`,
          `-${card.lose}`
        ].join("|")
      )
    ).toEqual([
      "SC-01|grand-market/honeycomb|cloverfield/old-shell|old-quarter/foxglove|+left|-second-left",
      "SC-02|ironwood/old-shell|millbank/foxglove|westgate/riverworks|+left|-second-right",
      "SC-03|ironwood/foxglove|sunmeadow/riverworks|canal-ward/many-wings|+left|-second-right",
      "SC-04|harbormouth/riverworks|red-orchard/many-wings|northreach/night-parliament|+second-left|-right",
      "SC-05|harbormouth/many-wings|mossfield/night-parliament|reedwater/honeycomb|+second-left|-left",
      "SC-06|grand-market/night-parliament|high-pastures/honeycomb|crown-road/old-shell|+right|-second-right",
      "SC-07|grand-market/honeycomb|cloverfield/foxglove|crown-road/riverworks|+left|-second-left",
      "SC-08|ironwood/old-shell|millbank/riverworks|northreach/many-wings|+right|-second-left",
      "SC-09|ironwood/foxglove|sunmeadow/many-wings|old-quarter/night-parliament|+left|-second-right",
      "SC-10|harbormouth/riverworks|red-orchard/night-parliament|canal-ward/honeycomb|+second-right|-right",
      "SC-11|grand-market/many-wings|mossfield/honeycomb|reedwater/old-shell|+second-right|-right",
      "SC-12|harbormouth/night-parliament|high-pastures/old-shell|westgate/foxglove|+right|-second-left",
      "SC-13|ironwood/honeycomb|cloverfield/riverworks|reedwater/many-wings|+second-right|-right",
      "SC-14|grand-market/old-shell|millbank/many-wings|westgate/night-parliament|+right|-second-right",
      "SC-15|harbormouth/foxglove|sunmeadow/night-parliament|crown-road/honeycomb|+right|-second-left",
      "SC-16|ironwood/riverworks|red-orchard/honeycomb|northreach/old-shell|+right|-second-right",
      "SC-17|grand-market/many-wings|mossfield/old-shell|canal-ward/foxglove|+second-right|-left",
      "SC-18|harbormouth/night-parliament|high-pastures/foxglove|old-quarter/riverworks|+second-right|-left",
      "SC-19|ironwood/honeycomb|cloverfield/many-wings|crown-road/night-parliament|+second-left|-right",
      "SC-20|grand-market/old-shell|millbank/night-parliament|old-quarter/honeycomb|+second-left|-left",
      "SC-21|harbormouth/foxglove|sunmeadow/honeycomb|canal-ward/old-shell|+left|-second-left",
      "SC-22|ironwood/riverworks|red-orchard/old-shell|reedwater/foxglove|+second-right|-left",
      "SC-23|harbormouth/many-wings|mossfield/foxglove|northreach/riverworks|+second-left|-right",
      "SC-24|grand-market/night-parliament|high-pastures/riverworks|westgate/many-wings|+second-left|-left"
    ]);
  });

  it("contains the exact 24 stable card IDs", () => {
    expect(SCORING_CARDS).toHaveLength(24);
    expect(SCORING_CARDS.map((card) => card.id)).toEqual(SCORING_CARD_IDS);
    expect(new Set(SCORING_CARD_IDS).size).toBe(24);
  });

  it("registers every scoring card in one compatible low-player pair", () => {
    expect(SCORING_CARD_PAIRS.flat()).toEqual(SCORING_CARD_IDS);
    for (const [firstId, secondId] of SCORING_CARD_PAIRS) {
      const districts = [firstId, secondId].flatMap((cardId) =>
        SCORING_CARDS.find((card) => card.id === cardId)!.objectives.map(
          (objective) => objective.districtId
        )
      );
      expect(new Set(districts).size).toBe(6);
    }
  });

  it("gives each card one non-neighboring objective at each scoring capacity", () => {
    for (const card of SCORING_CARDS) {
      expect(
        card.objectives.map(
          (objective) => DISTRICTS_BY_ID[objective.districtId].capacity
        )
      ).toEqual([6, 4, 2]);
      expect(new Set(card.objectives.map((objective) => objective.partyId)).size).toBe(
        3
      );
      for (const [index, objective] of card.objectives.entries()) {
        const otherDistricts = card.objectives
          .filter((_, otherIndex) => otherIndex !== index)
          .map((other) => other.districtId);
        for (const otherDistrict of otherDistricts) {
          expect(
            DISTRICTS_BY_ID[objective.districtId].adjacentDistrictIds
          ).not.toContain(otherDistrict);
        }
      }
    }
  });

  it("matches the district and party distribution", () => {
    const districtCounts = frequencies(
      SCORING_CARDS.flatMap((card) =>
        card.objectives.map((objective) => objective.districtId)
      )
    );
    for (const district of DISTRICTS) {
      const expected =
        district.capacity === 6 ? 8 : district.capacity === 3 ? 0 : 4;
      expect(districtCounts.get(district.id) ?? 0).toBe(expected);
    }

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
    expect(Object.isFrozen(PARTIES[0].bonuses[0])).toBe(true);
    expect(Object.isFrozen(SCORING_CARDS[0].objectives[0])).toBe(true);
    expect(Object.isFrozen(STANDARD_PLAYER_SETUP.operations)).toBe(true);
  });

  it("doubles every player resource and bid allowance at two or three players", () => {
    expect(STANDARD_PLAYER_SETUP.operations.court).toBe(2);
    expect(DOUBLED_PLAYER_SETUP.firms).toBe(
      STANDARD_PLAYER_SETUP.firms * 2
    );
    expect(DOUBLED_PLAYER_SETUP.leverage).toBe(
      STANDARD_PLAYER_SETUP.leverage * 2
    );
    expect(DOUBLED_PLAYER_SETUP.points).toBe(
      STANDARD_PLAYER_SETUP.points * 2
    );
    expect(DOUBLED_PLAYER_SETUP.openingBids).toBe(
      STANDARD_PLAYER_SETUP.openingBids * 2
    );
    expect(DOUBLED_PLAYER_SETUP.identityCards).toBe(
      STANDARD_PLAYER_SETUP.identityCards * 2
    );
    expect(DOUBLED_PLAYER_SETUP.counterbidSlots).toBe(
      STANDARD_PLAYER_SETUP.counterbidSlots * 2
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

  it("holds elections after rounds 4, 8, and 12", () => {
    expect(ELECTION_ROUNDS).toEqual([4, 8, 12]);
  });
});

it("keeps typed content identifiers assignable", () => {
  const district: DistrictId = DISTRICT_IDS[0];
  const party: PartyId = PARTY_IDS[0];

  expect({ district, party }).toEqual({
    district: "northreach",
    party: "honeycomb"
  });
});
