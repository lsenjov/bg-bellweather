import { describe, expect, it } from "vitest";
import { SCORING_CARDS_BY_ID } from "@bellweather/content";
import {
  determineWinners,
  recordElectionDraws,
  retainElectionSupport,
  relativeSeatIndex,
  scoreCard,
  scoreElectionDay,
  toElectionScoringCard,
  type ElectionPlayer,
  type RecordedDistrictDraw,
  type ScoringCard
} from "../src/election.js";
import type {
  DistrictState,
  OperationState,
  Party
} from "../src/operations.js";

describe("Election Day draws and coalition scoring", () => {
  it("records one shared capacity-based draw per named district without replacement", () => {
    let randomCalls = 0;
    const draws = recordElectionDraws(
      {
        six: district("six", 6, {
          honeycomb: 2,
          foxglove: 2,
          riverworks: 1
        }),
        four: district("four", 4, { "night-parliament": 1 }),
        two: district("two", 2, {})
      },
      [
        card("a", [
          ["six", "honeycomb"],
          ["four", "night-parliament"]
        ]),
        card("b", [
          ["six", "foxglove"],
          ["two", "riverworks"]
        ])
      ],
      () => {
        randomCalls += 1;
        return 0;
      }
    );
    expect(draws.six?.parties).toEqual([
      "honeycomb",
      "honeycomb",
      "foxglove"
    ]);
    expect(draws.four?.parties).toEqual(["night-parliament"]);
    expect(draws.two?.parties).toEqual([]);
    expect(randomCalls).toBe(4);
  });

  it("scores coalition partners reciprocally from the same recorded draw", () => {
    const draws: Record<string, RecordedDistrictDraw> = {
      six: {
        districtId: "six",
        parties: ["honeycomb", "foxglove", "riverworks"]
      }
    };
    const coalitionTargets = emptyCoalitionTargets();
    coalitionTargets.honeycomb = "foxglove";
    coalitionTargets.foxglove = "honeycomb";
    expect(
      scoreCard(card("h", [["six", "honeycomb"]]), draws, coalitionTargets)
    ).toBe(2);
    expect(
      scoreCard(card("f", [["six", "foxglove"]]), draws, coalitionTargets)
    ).toBe(2);
    expect(
      scoreCard(card("r", [["six", "riverworks"]]), draws, coalitionTargets)
    ).toBe(1);
  });

  it("keeps drawn Support, removes the undrawn remainder, and leaves unnamed districts unchanged", () => {
    const districts = {
      six: district("six", 6, {
        honeycomb: 2,
        foxglove: 2,
        riverworks: 1
      }),
      "bellweather-centre": district("bellweather-centre", 3, {
        "old-shell": 2,
        "many-wings": 1
      })
    };
    const draws = recordElectionDraws(
      districts,
      [card("a", [["six", "honeycomb"]])],
      () => 0
    );

    expect(retainElectionSupport(districts, draws)).toEqual({
      six: { honeycomb: 2, foxglove: 1 },
      "bellweather-centre": { "old-shell": 2, "many-wings": 1 }
    });
  });
});

describe("Election Day scoring", () => {
  it("adapts the published scoring deck to the election model", () => {
    expect(toElectionScoringCard(SCORING_CARDS_BY_ID["SC-01"])).toEqual({
      id: "SC-01",
      objectives: [
        { districtId: "grand-market", party: "honeycomb" },
        { districtId: "cloverfield", party: "old-shell" },
        { districtId: "old-quarter", party: "foxglove" }
      ],
      positiveSeat: "left",
      negativeSeat: "second-left"
    });
  });

  it("ignores relative seats below four players and permits negative balances", () => {
    const result = scoreElectionDay({
      state: electionState({
        six: district("six", 6, { honeycomb: 3 })
      }),
      players: [
        player(
          "p1",
          -2,
          card("one", [["six", "night-parliament"]])
        ),
        player("p2", 1, card("two", [["six", "honeycomb"]]))
      ],
      random: () => 0,
      finalElection: false
    });
    expect(result.scores).toEqual([
      {
        playerId: "p1",
        baseDistrictScore: 0,
        seatModifier: 0,
        pointsChange: 0,
        resultingPoints: -2
      },
      {
        playerId: "p2",
        baseDistrictScore: 3,
        seatModifier: 0,
        pointsChange: 3,
        resultingPoints: 4
      }
    ]);
    expect(result.winnerIds).toEqual([]);
  });

  it("sums both low-player agendas while sharing district draws", () => {
    const result = scoreElectionDay({
      state: electionState({
        six: district("six", 6, { honeycomb: 2, foxglove: 1 }),
        four: district("four", 4, { riverworks: 2 })
      }),
      players: [
        player("p1", 0, [
          card("one-a", [["six", "honeycomb"]]),
          card("one-b", [["four", "riverworks"]])
        ]),
        player("p2", 0, [
          card("two-a", [["six", "foxglove"]]),
          card("two-b", [["four", "night-parliament"]])
        ])
      ],
      random: () => 0,
      finalElection: false
    });

    expect(Object.keys(result.draws)).toEqual(["six", "four"]);
    expect(result.scores.map((score) => score.baseDistrictScore)).toEqual([4, 1]);
    expect(result.scores.every((score) => score.seatModifier === 0)).toBe(true);
  });

  it("applies four-player references from base scores only", () => {
    const cards = [
      referencedCard("c1", "left", "right", "honeycomb"),
      referencedCard("c2", "left", "right", "foxglove"),
      referencedCard("c3", "left", "right", "riverworks"),
      referencedCard("c4", "left", "right", "night-parliament")
    ];
    const result = scoreElectionDay({
      state: electionState({
        six: district("six", 6, {
          honeycomb: 3,
          foxglove: 2,
          riverworks: 1
        })
      }),
      players: cards.map((scoringCard, index) =>
        player(`p${index + 1}`, 5, scoringCard)
      ),
      random: sequence([0, 0, 0]),
      finalElection: true
    });
    expect(result.scores.map((score) => score.baseDistrictScore)).toEqual([
      3, 0, 0, 0
    ]);
    expect(result.scores.map((score) => score.seatModifier)).toEqual([
      0, 3, 0, -3
    ]);
    expect(result.scores.map((score) => score.resultingPoints)).toEqual([
      8, 8, 5, 2
    ]);
    expect(result.winnerIds).toEqual(["p1", "p2"]);
  });

  it("maps clockwise relative seats and shares tied wins at any point total", () => {
    expect(relativeSeatIndex(0, 6, "left")).toBe(5);
    expect(relativeSeatIndex(0, 6, "right")).toBe(1);
    expect(relativeSeatIndex(0, 6, "second-left")).toBe(4);
    expect(relativeSeatIndex(0, 6, "second-right")).toBe(2);
    expect(
      determineWinners([
        { id: "a", points: -3 },
        { id: "b", points: -1 },
        { id: "c", points: -1 }
      ])
    ).toEqual(["b", "c"]);
  });
});

function referencedCard(
  id: string,
  positiveSeat: "left" | "right" | "second-left" | "second-right",
  negativeSeat: "left" | "right" | "second-left" | "second-right",
  party: Party
): ScoringCard {
  return {
    ...card(id, [["six", party]]),
    positiveSeat,
    negativeSeat
  };
}

function card(
  id: string,
  objectives: readonly (readonly [string, Party])[]
): ScoringCard {
  return {
    id,
    objectives: objectives.map(([districtId, party]) => ({
      districtId,
      party
    }))
  };
}

function player(
  id: string,
  points: number,
  scoringCards: ScoringCard | ScoringCard[]
): ElectionPlayer {
  return {
    id,
    position: Number.parseInt(id.replace(/\D/g, ""), 10) - 1,
    points,
    cards: Array.isArray(scoringCards) ? scoringCards : [scoringCards]
  };
}

function district(
  id: string,
  capacity: number,
  support: Partial<Record<Party, number>>
): DistrictState {
  return { id, capacity, neighbors: [], support };
}

function electionState(
  districts: Record<string, DistrictState>
): Pick<OperationState, "districts" | "coalitionTargets"> {
  return { districts, coalitionTargets: emptyCoalitionTargets() };
}

function emptyCoalitionTargets(): Record<Party, Party | null> {
  return {
    honeycomb: null,
    "old-shell": null,
    foxglove: null,
    riverworks: null,
    "many-wings": null,
    "night-parliament": null
  };
}

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}
