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
  { id: "SC-01", objectives: [objective("ironwood", "honeycomb"), objective("millbank", "old-shell"), objective("canal-ward", "foxglove")], gain: "left", lose: "second-left" },
  { id: "SC-02", objectives: [objective("harbormouth", "old-shell"), objective("high-pastures", "foxglove"), objective("old-quarter", "riverworks")], gain: "left", lose: "second-right" },
  { id: "SC-03", objectives: [objective("harbormouth", "foxglove"), objective("mossfield", "riverworks"), objective("northreach", "many-wings")], gain: "left", lose: "second-right" },
  { id: "SC-04", objectives: [objective("grand-market", "riverworks"), objective("cloverfield", "many-wings"), objective("crown-road", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-05", objectives: [objective("grand-market", "many-wings"), objective("cloverfield", "night-parliament"), objective("old-quarter", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-06", objectives: [objective("ironwood", "night-parliament"), objective("red-orchard", "honeycomb"), objective("reedwater", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-07", objectives: [objective("ironwood", "honeycomb"), objective("sunmeadow", "foxglove"), objective("canal-ward", "riverworks")], gain: "left", lose: "second-left" },
  { id: "SC-08", objectives: [objective("harbormouth", "old-shell"), objective("high-pastures", "riverworks"), objective("westgate", "many-wings")], gain: "right", lose: "second-left" },
  { id: "SC-09", objectives: [objective("harbormouth", "foxglove"), objective("mossfield", "many-wings"), objective("reedwater", "night-parliament")], gain: "left", lose: "second-right" },
  { id: "SC-10", objectives: [objective("grand-market", "riverworks"), objective("millbank", "night-parliament"), objective("westgate", "honeycomb")], gain: "second-right", lose: "right" },
  { id: "SC-11", objectives: [objective("ironwood", "many-wings"), objective("sunmeadow", "honeycomb"), objective("westgate", "old-shell")], gain: "second-right", lose: "right" },
  { id: "SC-12", objectives: [objective("grand-market", "night-parliament"), objective("cloverfield", "old-shell"), objective("reedwater", "foxglove")], gain: "right", lose: "second-left" },
  { id: "SC-13", objectives: [objective("harbormouth", "honeycomb"), objective("red-orchard", "riverworks"), objective("old-quarter", "many-wings")], gain: "second-right", lose: "right" },
  { id: "SC-14", objectives: [objective("ironwood", "old-shell"), objective("sunmeadow", "many-wings"), objective("northreach", "night-parliament")], gain: "right", lose: "second-right" },
  { id: "SC-15", objectives: [objective("grand-market", "foxglove"), objective("high-pastures", "night-parliament"), objective("reedwater", "honeycomb")], gain: "right", lose: "second-left" },
  { id: "SC-16", objectives: [objective("harbormouth", "riverworks"), objective("mossfield", "honeycomb"), objective("canal-ward", "old-shell")], gain: "right", lose: "second-right" },
  { id: "SC-17", objectives: [objective("ironwood", "many-wings"), objective("red-orchard", "old-shell"), objective("crown-road", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-18", objectives: [objective("grand-market", "night-parliament"), objective("millbank", "foxglove"), objective("northreach", "riverworks")], gain: "second-right", lose: "left" },
  { id: "SC-19", objectives: [objective("harbormouth", "honeycomb"), objective("high-pastures", "many-wings"), objective("canal-ward", "night-parliament")], gain: "second-left", lose: "right" },
  { id: "SC-20", objectives: [objective("ironwood", "old-shell"), objective("red-orchard", "night-parliament"), objective("northreach", "honeycomb")], gain: "second-left", lose: "left" },
  { id: "SC-21", objectives: [objective("grand-market", "foxglove"), objective("millbank", "honeycomb"), objective("crown-road", "old-shell")], gain: "left", lose: "second-left" },
  { id: "SC-22", objectives: [objective("harbormouth", "riverworks"), objective("mossfield", "old-shell"), objective("old-quarter", "foxglove")], gain: "second-right", lose: "left" },
  { id: "SC-23", objectives: [objective("grand-market", "many-wings"), objective("cloverfield", "foxglove"), objective("westgate", "riverworks")], gain: "second-left", lose: "right" },
  { id: "SC-24", objectives: [objective("ironwood", "night-parliament"), objective("sunmeadow", "riverworks"), objective("crown-road", "many-wings")], gain: "second-left", lose: "left" }
] as const satisfies readonly ScoringCard[]);

export const SCORING_CARDS_BY_ID = Object.freeze(
  Object.fromEntries(SCORING_CARDS.map((card) => [card.id, card])) as {
    readonly [Id in ScoringCardId]: Extract<
      (typeof SCORING_CARDS)[number],
      { readonly id: Id }
    >;
  }
);
