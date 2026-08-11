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
    favoredOperations: ["organise", "court"],
    bonuses: [
      {
        operation: "organise",
        name: "Waggle Route",
        effect:
          "After Organise resolves, add one Honeycomb Support to another free spot in the destination district.",
        timing: "immediate"
      },
      {
        operation: "court",
        name: "Common Cause",
        effect:
          "After Court resolves, if the selected party is Honeycomb's Coalition Target, move one Honeycomb Support to a free spot in a different district containing that party's Support.",
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
    favoredOperations: ["organise", "smear"],
    bonuses: [
      {
        operation: "organise",
        name: "Dig In",
        effect:
          "After a movement Organise resolves, add one Old Shell Support to the vacated source spot. Dig In cannot be used when recovering from no Support.",
        timing: "immediate"
      },
      {
        operation: "smear",
        name: "Stonewall",
        effect:
          "After Smear removes rival Support, remove a second Support belonging to the same rival from the affected district.",
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
    favoredOperations: ["smear", "court"],
    bonuses: [
      {
        operation: "smear",
        name: "Spin",
        effect: "Add one Foxglove Support to the spot its Smear vacated.",
        timing: "immediate"
      },
      {
        operation: "court",
        name: "Whisper Network",
        effect:
          "After Court resolves, move one Foxglove Court Support from a different Court space to the selected party's Court space, then update Foxglove's Coalition Target again.",
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
    favoredOperations: ["organise", "rally"],
    bonuses: [
      {
        operation: "organise",
        name: "Canal Network",
        effect:
          "Riverworks may Organise through connected districts containing its Support and end in a free district at the end of that route.",
        timing: "immediate"
      },
      {
        operation: "rally",
        name: "Public Works",
        effect:
          "After Rally resolves, add one Riverworks Support to a free spot in a district neighboring the Rally district.",
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
    favoredOperations: ["rally", "court"],
    bonuses: [
      {
        operation: "rally",
        name: "Scatter the Flock",
        effect:
          "After Rally resolves, move as many Many Wings Support as possible from the Rally district to distinct neighboring districts with free spots.",
        timing: "immediate"
      },
      {
        operation: "court",
        name: "Joint Campaign",
        effect:
          "After Court resolves, add one Support belonging to the selected party to a free spot in a district containing Many Wings Support.",
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
    favoredOperations: ["rally", "smear"],
    bonuses: [
      {
        operation: "rally",
        name: "Night Shift",
        effect:
          "After every contest and Revolving Door finishes, add one Night Support to a legal Rally district tied for the fewest total Support.",
        timing: "delayed"
      },
      {
        operation: "smear",
        name: "Midnight Leak",
        effect:
          "After Smear removes rival Support, remove one Court Support belonging to that rival from any Court space, then update its Coalition Target.",
        timing: "immediate"
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
