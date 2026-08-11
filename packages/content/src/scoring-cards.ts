import type { DistrictId } from "./districts.js";
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
  readonly districtId: DistrictId;
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

export const SCORING_CARD_PAIRS = deepFreeze([
  ["SC-01", "SC-02"], ["SC-03", "SC-04"],
  ["SC-05", "SC-06"], ["SC-07", "SC-08"],
  ["SC-09", "SC-10"], ["SC-11", "SC-12"],
  ["SC-13", "SC-14"], ["SC-15", "SC-16"],
  ["SC-17", "SC-18"], ["SC-19", "SC-20"],
  ["SC-21", "SC-22"], ["SC-23", "SC-24"]
] as const satisfies readonly (readonly [ScoringCardId, ScoringCardId])[]);

const objective = (
  districtId: DistrictId,
  partyId: PartyId
): ScoringObjective => ({ districtId, partyId });

export const SCORING_CARDS = deepFreeze([
  { id: "SC-01", objectives: [objective("grand-market", "honeycomb"), objective("cloverfield", "old-shell"), objective("old-quarter", "foxglove")], gain: "left", lose: "second-left" },
  { id: "SC-02", objectives: [objective("ironwood", "old-shell"), objective("millbank", "foxglove"), objective("westgate", "riverworks")], gain: "left", lose: "second-right" },
  { id: "SC-03", objectives: [objective("ironwood", "foxglove"), objective("sunmeadow", "riverworks"), objective("canal-ward", "many-wings")], gain: "left", lose: "second-right" },
  { id: "SC-04", objectives: [objective("harbormouth", "riverworks"), objective("red-orchard", "many-wings"), objective("northreach", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-05", objectives: [objective("harbormouth", "many-wings"), objective("mossfield", "night-parliament"), objective("reedwater", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-06", objectives: [objective("grand-market", "night-parliament"), objective("high-pastures", "honeycomb"), objective("crown-road", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-07", objectives: [objective("grand-market", "honeycomb"), objective("cloverfield", "foxglove"), objective("crown-road", "riverworks")], gain: "left", lose: "second-left" },
  { id: "SC-08", objectives: [objective("ironwood", "old-shell"), objective("millbank", "riverworks"), objective("northreach", "many-wings")], gain: "right", lose: "second-left" },
  { id: "SC-09", objectives: [objective("ironwood", "foxglove"), objective("sunmeadow", "many-wings"), objective("old-quarter", "night-parliament")], gain: "left", lose: "second-right" },
  { id: "SC-10", objectives: [objective("harbormouth", "riverworks"), objective("red-orchard", "night-parliament"), objective("canal-ward", "honeycomb")], gain: "second-right", lose: "right" },
  { id: "SC-11", objectives: [objective("grand-market", "many-wings"), objective("mossfield", "honeycomb"), objective("reedwater", "old-shell")], gain: "second-right", lose: "right" },
  { id: "SC-12", objectives: [objective("harbormouth", "night-parliament"), objective("high-pastures", "old-shell"), objective("westgate", "foxglove")], gain: "right", lose: "second-left" },
  { id: "SC-13", objectives: [objective("ironwood", "honeycomb"), objective("cloverfield", "riverworks"), objective("reedwater", "many-wings")], gain: "second-right", lose: "right" },
  { id: "SC-14", objectives: [objective("grand-market", "old-shell"), objective("millbank", "many-wings"), objective("westgate", "night-parliament")], gain: "right", lose: "second-right" },
  { id: "SC-15", objectives: [objective("harbormouth", "foxglove"), objective("sunmeadow", "night-parliament"), objective("crown-road", "honeycomb")], gain: "right", lose: "second-left" },
  { id: "SC-16", objectives: [objective("ironwood", "riverworks"), objective("red-orchard", "honeycomb"), objective("northreach", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-17", objectives: [objective("grand-market", "many-wings"), objective("mossfield", "old-shell"), objective("canal-ward", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-18", objectives: [objective("harbormouth", "night-parliament"), objective("high-pastures", "foxglove"), objective("old-quarter", "riverworks")], gain: "second-right", lose: "left" },
  { id: "SC-19", objectives: [objective("ironwood", "honeycomb"), objective("cloverfield", "many-wings"), objective("crown-road", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-20", objectives: [objective("grand-market", "old-shell"), objective("millbank", "night-parliament"), objective("old-quarter", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-21", objectives: [objective("harbormouth", "foxglove"), objective("sunmeadow", "honeycomb"), objective("canal-ward", "old-shell")], gain: "left", lose: "second-left" },
  { id: "SC-22", objectives: [objective("ironwood", "riverworks"), objective("red-orchard", "old-shell"), objective("reedwater", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-23", objectives: [objective("harbormouth", "many-wings"), objective("mossfield", "foxglove"), objective("northreach", "riverworks")], gain: "second-left", lose: "right" },
  { id: "SC-24", objectives: [objective("grand-market", "night-parliament"), objective("high-pastures", "riverworks"), objective("westgate", "many-wings")], gain: "second-left", lose: "left" }
] as const satisfies readonly ScoringCard[]);

export const SCORING_CARDS_BY_ID = Object.freeze(
  Object.fromEntries(SCORING_CARDS.map((card) => [card.id, card])) as {
    readonly [Id in ScoringCardId]: Extract<
      (typeof SCORING_CARDS)[number],
      { readonly id: Id }
    >;
  }
);
