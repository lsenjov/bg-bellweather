import { deepFreeze } from "./immutable.js";

export const OPERATION_IDS = deepFreeze([
  "organise",
  "rally",
  "smear",
  "coalition"
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

export interface PartyBonus {
  readonly operation: OperationId;
  readonly name: string;
  readonly effect: string;
  readonly timing: "immediate" | "delayed";
}

export interface PartyDefinition {
  readonly id: PartyId;
  readonly name: string;
  readonly shortName: string;
  readonly animal: string;
  readonly color: `#${string}`;
  readonly favoredOperations: readonly [OperationId, OperationId];
  readonly bonuses: readonly [PartyBonus, PartyBonus];
}

export const PARTIES = deepFreeze([
  {
    id: "honeycomb",
    name: "Honeycomb Cooperative",
    shortName: "Honeycomb",
    animal: "Bees",
    color: "#d7aa12",
    favoredOperations: ["organise", "rally"],
    bonuses: [
      {
        operation: "organise",
        name: "Leave a Cell Behind",
        effect:
          "After moving Support, add one Honeycomb Support to the vacated source spot. When recovering from no Support, add a second Support in the destination district.",
        timing: "immediate"
      },
      {
        operation: "rally",
        name: "Swarm",
        effect: "Add a second Honeycomb Support in the Rally district.",
        timing: "immediate"
      }
    ]
  },
  {
    id: "old-shell",
    name: "Old Shell Union",
    shortName: "Old Shell",
    animal: "Tortoises",
    color: "#3f7447",
    favoredOperations: ["smear", "coalition"],
    bonuses: [
      {
        operation: "smear",
        name: "Stonewall",
        effect:
          "Remove a second Support belonging to the same rival from the same district.",
        timing: "immediate"
      },
      {
        operation: "coalition",
        name: "Binding Pact",
        effect:
          "Reinforce a successfully redirected Coalition target. The next Coalition operation that would redirect it removes the reinforcement instead.",
        timing: "immediate"
      }
    ]
  },
  {
    id: "foxglove",
    name: "Foxglove League",
    shortName: "Foxglove",
    animal: "Foxes",
    color: "#b83d6d",
    favoredOperations: ["organise", "smear"],
    bonuses: [
      {
        operation: "organise",
        name: "Slip Away",
        effect:
          "When moving Foxglove Support, choose any free spot instead of a neighboring free spot.",
        timing: "immediate"
      },
      {
        operation: "smear",
        name: "Spin",
        effect: "Add one Foxglove Support to the spot its Smear vacated.",
        timing: "immediate"
      }
    ]
  },
  {
    id: "riverworks",
    name: "Riverworks Party",
    shortName: "Riverworks",
    animal: "Beavers",
    color: "#2d6fa3",
    favoredOperations: ["rally", "smear"],
    bonuses: [
      {
        operation: "rally",
        name: "Public Works",
        effect:
          "Add a second Riverworks Support in a district neighboring the Rally district.",
        timing: "immediate"
      },
      {
        operation: "smear",
        name: "Undermine",
        effect:
          "Remove a second Support belonging to the same rival from a district neighboring the first affected district.",
        timing: "immediate"
      }
    ]
  },
  {
    id: "many-wings",
    name: "Many Wings Coalition",
    shortName: "Many Wings",
    animal: "Starlings",
    color: "#d86f24",
    favoredOperations: ["organise", "coalition"],
    bonuses: [
      {
        operation: "organise",
        name: "Murmuration",
        effect:
          "Resolve the Organise baseline again immediately using the updated map state.",
        timing: "immediate"
      },
      {
        operation: "coalition",
        name: "Local Chapters",
        effect:
          "Add one Many Wings Support in a free spot in a district containing the coalition target.",
        timing: "immediate"
      }
    ]
  },
  {
    id: "night-parliament",
    name: "Night Parliament",
    shortName: "Night",
    animal: "Owls",
    color: "#252522",
    favoredOperations: ["rally", "coalition"],
    bonuses: [
      {
        operation: "rally",
        name: "Closing Argument",
        effect:
          "After ordinary operation cards finish, the claiming bid resolves one additional Rally baseline.",
        timing: "delayed"
      },
      {
        operation: "coalition",
        name: "After-Hours Deal",
        effect:
          "After ordinary operation cards finish, the claiming bid resolves one additional Coalition operation.",
        timing: "delayed"
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
