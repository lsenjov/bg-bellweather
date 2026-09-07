import type { RegionId } from "./districts.js";
import { deepFreeze } from "./immutable.js";
import type { PartyId } from "./parties.js";

export const SEAT_REFERENCES = deepFreeze([
  "left",
  "right",
  "second-left",
  "second-right"
] as const);
export type SeatReference = (typeof SEAT_REFERENCES)[number];

export interface ScoringObjective {
  readonly regionId: RegionId;
  readonly partyId: PartyId;
}

export interface ScoringCard {
  readonly id: ScoringCardId;
  readonly objectives: readonly [
    ScoringObjective,
    ScoringObjective,
    ScoringObjective
  ];
  readonly gain: SeatReference;
  readonly lose: SeatReference;
}

export const SCORING_CARD_IDS = deepFreeze([
  "SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06",
  "SC-07", "SC-08", "SC-09", "SC-10", "SC-11", "SC-12",
  "SC-13", "SC-14", "SC-15", "SC-16", "SC-17", "SC-18",
  "SC-19", "SC-20", "SC-21", "SC-22", "SC-23", "SC-24"
] as const);
export type ScoringCardId = (typeof SCORING_CARD_IDS)[number];

const objective = (
  regionId: RegionId,
  partyId: PartyId
): ScoringObjective => ({ regionId, partyId });

export const SCORING_CARDS = deepFreeze([
  { id: "SC-01", objectives: [objective("urban", "honeycomb"), objective("mixed", "old-shell"), objective("outlying", "foxglove")], gain: "left", lose: "second-left" },
  { id: "SC-02", objectives: [objective("urban", "old-shell"), objective("mixed", "foxglove"), objective("outlying", "riverworks")], gain: "left", lose: "second-right" },
  { id: "SC-03", objectives: [objective("urban", "foxglove"), objective("mixed", "riverworks"), objective("outlying", "many-wings")], gain: "left", lose: "second-right" },
  { id: "SC-04", objectives: [objective("urban", "riverworks"), objective("mixed", "many-wings"), objective("outlying", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-05", objectives: [objective("urban", "many-wings"), objective("mixed", "night-parliament"), objective("outlying", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-06", objectives: [objective("urban", "night-parliament"), objective("mixed", "honeycomb"), objective("outlying", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-07", objectives: [objective("urban", "honeycomb"), objective("mixed", "foxglove"), objective("outlying", "riverworks")], gain: "left", lose: "second-left" },
  { id: "SC-08", objectives: [objective("urban", "old-shell"), objective("mixed", "riverworks"), objective("outlying", "many-wings")], gain: "right", lose: "second-left" },
  { id: "SC-09", objectives: [objective("urban", "foxglove"), objective("mixed", "many-wings"), objective("outlying", "night-parliament")], gain: "left", lose: "second-right" },
  { id: "SC-10", objectives: [objective("urban", "riverworks"), objective("mixed", "night-parliament"), objective("outlying", "honeycomb")], gain: "second-right", lose: "right" },
  { id: "SC-11", objectives: [objective("urban", "many-wings"), objective("mixed", "honeycomb"), objective("outlying", "old-shell")], gain: "second-right", lose: "right" },
  { id: "SC-12", objectives: [objective("urban", "night-parliament"), objective("mixed", "old-shell"), objective("outlying", "foxglove")], gain: "right", lose: "second-left" },
  { id: "SC-13", objectives: [objective("urban", "honeycomb"), objective("mixed", "riverworks"), objective("outlying", "many-wings")], gain: "second-right", lose: "right" },
  { id: "SC-14", objectives: [objective("urban", "old-shell"), objective("mixed", "many-wings"), objective("outlying", "night-parliament")], gain: "right", lose: "second-right" },
  { id: "SC-15", objectives: [objective("urban", "foxglove"), objective("mixed", "night-parliament"), objective("outlying", "honeycomb")], gain: "right", lose: "second-left" },
  { id: "SC-16", objectives: [objective("urban", "riverworks"), objective("mixed", "honeycomb"), objective("outlying", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-17", objectives: [objective("urban", "many-wings"), objective("mixed", "old-shell"), objective("outlying", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-18", objectives: [objective("urban", "night-parliament"), objective("mixed", "foxglove"), objective("outlying", "riverworks")], gain: "second-right", lose: "left" },
  { id: "SC-19", objectives: [objective("urban", "honeycomb"), objective("mixed", "many-wings"), objective("outlying", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-20", objectives: [objective("urban", "old-shell"), objective("mixed", "night-parliament"), objective("outlying", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-21", objectives: [objective("urban", "foxglove"), objective("mixed", "honeycomb"), objective("outlying", "old-shell")], gain: "left", lose: "second-left" },
  { id: "SC-22", objectives: [objective("urban", "riverworks"), objective("mixed", "old-shell"), objective("outlying", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-23", objectives: [objective("urban", "many-wings"), objective("mixed", "foxglove"), objective("outlying", "riverworks")], gain: "second-left", lose: "right" },
  { id: "SC-24", objectives: [objective("urban", "night-parliament"), objective("mixed", "riverworks"), objective("outlying", "many-wings")], gain: "second-left", lose: "left" }
] as const satisfies readonly ScoringCard[]);

export const SCORING_CARDS_BY_ID = Object.freeze(
  Object.fromEntries(SCORING_CARDS.map((card) => [card.id, card])) as {
    readonly [Id in ScoringCardId]: Extract<
      (typeof SCORING_CARDS)[number],
      { readonly id: Id }
    >;
  }
);

export function scoringCardsCompatible(first: ScoringCard, second: ScoringCard): boolean {
  return !first.objectives.some((a) => second.objectives.some(
    (b) => a.regionId === b.regionId && a.partyId === b.partyId
  ));
}
