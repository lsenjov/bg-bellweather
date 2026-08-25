import { deepFreeze } from "./immutable.js";

export const OPERATION_IDS = deepFreeze([
  "organise",
  "rally",
  "smear",
  "court"
] as const);
export type OperationId = (typeof OPERATION_IDS)[number];

export const PARTY_IDS = deepFreeze([
  "honeycomb",
  "old-shell",
  "foxglove",
  "riverworks",
  "many-wings",
  "night-parliament"
] as const);
export type PartyId = (typeof PARTY_IDS)[number];

export const BONUS_CARD_IDS = deepFreeze([
  "honeycomb-waggle-route",
  "honeycomb-common-cause",
  "honeycomb-every-bee-counts",
  "old-shell-dig-in",
  "old-shell-stonewall",
  "old-shell-institutional-memory",
  "foxglove-spin",
  "foxglove-whisper-network",
  "foxglove-shell-firm",
  "riverworks-canal-network",
  "riverworks-public-works",
  "riverworks-mass-transit",
  "many-wings-scatter-the-flock",
  "many-wings-joint-campaign",
  "many-wings-empty-every-nest",
  "night-parliament-quiet-hours",
  "night-parliament-midnight-leak",
  "night-parliament-midnight-session"
] as const);
export type BonusCardId = (typeof BONUS_CARD_IDS)[number];

export interface BonusCardDefinition {
  readonly id: BonusCardId;
  readonly homePartyId: PartyId;
  readonly operation: OperationId | null;
  readonly name: string;
  readonly effect: string;
}

export interface PartyDefinition {
  readonly id: PartyId;
  readonly name: string;
  readonly shortName: string;
  readonly animal: string;
  readonly color: `#${string}`;
  readonly favoredOperations: readonly [OperationId, OperationId];
  readonly bonusCards: readonly [
    BonusCardDefinition,
    BonusCardDefinition,
    BonusCardDefinition
  ];
}

export const PARTIES = deepFreeze([
  {
    id: "honeycomb",
    name: "Honeycomb Cooperative",
    shortName: "Honeycomb",
    animal: "Bees",
    color: "#d7aa12",
    favoredOperations: ["organise", "court"],
    bonusCards: [
      {
        id: "honeycomb-waggle-route",
        homePartyId: "honeycomb",
        operation: "organise",
        name: "Waggle Route",
        effect:
          "Resolve Organise for the acting party, then add another acting-party Support to a free spot in the destination district."
      },
      {
        id: "honeycomb-common-cause",
        homePartyId: "honeycomb",
        operation: "court",
        name: "Common Cause",
        effect:
          "Resolve Court for the acting party. The selected party must become its Coalition Target; then move acting-party Support to a different free district containing selected-party Support."
      },
      {
        id: "honeycomb-every-bee-counts",
        homePartyId: "honeycomb",
        operation: null,
        name: "Every Bee Counts",
        effect:
          "Add acting-party Support to every district that contains exactly one acting-party Support and has a free spot."
      }
    ]
  },
  {
    id: "old-shell",
    name: "Old Shell Union",
    shortName: "Old Shell",
    animal: "Tortoises",
    color: "#3f7447",
    favoredOperations: ["organise", "smear"],
    bonusCards: [
      {
        id: "old-shell-dig-in",
        homePartyId: "old-shell",
        operation: "organise",
        name: "Dig In",
        effect:
          "Resolve a movement Organise for the acting party, then add acting-party Support to the vacated source spot."
      },
      {
        id: "old-shell-stonewall",
        homePartyId: "old-shell",
        operation: "smear",
        name: "Stonewall",
        effect:
          "Resolve Smear for the acting party, then remove a second Support belonging to the same rival from that district."
      },
      {
        id: "old-shell-institutional-memory",
        homePartyId: "old-shell",
        operation: null,
        name: "Institutional Memory",
        effect:
          "Choose a revealed scoring card. For each chosen objective, move one Support belonging to the named party from another district to the objective's district. Each destination must have a free spot."
      }
    ]
  },
  {
    id: "foxglove",
    name: "Foxglove League",
    shortName: "Foxglove",
    animal: "Foxes",
    color: "#b83d6d",
    favoredOperations: ["smear", "court"],
    bonusCards: [
      {
        id: "foxglove-spin",
        homePartyId: "foxglove",
        operation: "smear",
        name: "Spin",
        effect:
          "Resolve Smear for the acting party, then add acting-party Support to the vacated spot."
      },
      {
        id: "foxglove-whisper-network",
        homePartyId: "foxglove",
        operation: "court",
        name: "Whisper Network",
        effect:
          "Resolve Court for the acting party, then move its Court Support from another party's space to the selected party and update its Coalition Target again."
      },
      {
        id: "foxglove-shell-firm",
        homePartyId: "foxglove",
        operation: null,
        name: "Shell Firm",
        effect:
          "Choose another party without a Firm marker. Move the acting party's Firm marker and complete Operation pile to it. Then end this Lobby action."
      }
    ]
  },
  {
    id: "riverworks",
    name: "Riverworks Party",
    shortName: "Riverworks",
    animal: "Beavers",
    color: "#2d6fa3",
    favoredOperations: ["organise", "rally"],
    bonusCards: [
      {
        id: "riverworks-canal-network",
        homePartyId: "riverworks",
        operation: "organise",
        name: "Canal Network",
        effect:
          "Move acting-party Support through connected districts containing its Support to a free destination at the end of the route."
      },
      {
        id: "riverworks-public-works",
        homePartyId: "riverworks",
        operation: "rally",
        name: "Public Works",
        effect:
          "Resolve Rally for the acting party, then add acting-party Support to a free neighboring district."
      },
      {
        id: "riverworks-mass-transit",
        homePartyId: "riverworks",
        operation: null,
        name: "Mass Transit",
        effect:
          "Choose a path of two to five districts with a free spot at one end. Every other district must contain Support. Shift one Support from each of those districts one step toward the free spot."
      }
    ]
  },
  {
    id: "many-wings",
    name: "Many Wings Coalition",
    shortName: "Many Wings",
    animal: "Starlings",
    color: "#d86f24",
    favoredOperations: ["rally", "court"],
    bonusCards: [
      {
        id: "many-wings-scatter-the-flock",
        homePartyId: "many-wings",
        operation: "rally",
        name: "Scatter the Flock",
        effect:
          "Resolve Rally for the acting party, then move the maximum possible acting-party Support to distinct free neighboring districts."
      },
      {
        id: "many-wings-joint-campaign",
        homePartyId: "many-wings",
        operation: "court",
        name: "Joint Campaign",
        effect:
          "Resolve Court for the acting party, then add selected-party Support to a free district containing acting-party Support."
      },
      {
        id: "many-wings-empty-every-nest",
        homePartyId: "many-wings",
        operation: null,
        name: "Empty Every Nest",
        effect:
          "Move one acting-party Support from every district containing at least two acting-party Support to the same number of different districts with no acting-party Support and a free spot."
      }
    ]
  },
  {
    id: "night-parliament",
    name: "Night Parliament",
    shortName: "Night",
    animal: "Owls",
    color: "#252522",
    favoredOperations: ["rally", "smear"],
    bonusCards: [
      {
        id: "night-parliament-quiet-hours",
        homePartyId: "night-parliament",
        operation: "rally",
        name: "Quiet Hours",
        effect:
          "Resolve Rally for the acting party, then add acting-party Support to an otherwise empty district."
      },
      {
        id: "night-parliament-midnight-leak",
        homePartyId: "night-parliament",
        operation: "smear",
        name: "Midnight Leak",
        effect:
          "Resolve Smear for the acting party, then remove rival Court Support and update that rival's Coalition Target."
      },
      {
        id: "night-parliament-midnight-session",
        homePartyId: "night-parliament",
        operation: null,
        name: "Midnight Session",
        effect:
          "Choose a closed party. Place one of your returned Firm markers there. That party opens with an empty Operation pile."
      }
    ]
  }
] as const satisfies readonly PartyDefinition[]);

export const PARTIES_BY_ID = Object.freeze(
  Object.fromEntries(PARTIES.map((party) => [party.id, party])) as {
    readonly [Id in PartyId]: Extract<
      (typeof PARTIES)[number],
      { readonly id: Id }
    >;
  }
);

export const BONUS_CARDS = deepFreeze(
  PARTIES.flatMap((party) => [...party.bonusCards]) as BonusCardDefinition[]
);

export const BONUS_CARDS_BY_ID = Object.freeze(
  Object.fromEntries(BONUS_CARDS.map((card) => [card.id, card])) as {
    readonly [Id in BonusCardId]: BonusCardDefinition & { readonly id: Id };
  }
);
