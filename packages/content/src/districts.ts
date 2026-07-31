import { deepFreeze } from "./immutable.js";

export const DISTRICT_IDS = deepFreeze([
  "northreach",
  "cloverfield",
  "harbormouth",
  "millbank",
  "reedwater",
  "sunmeadow",
  "grand-market",
  "red-orchard",
  "westgate",
  "mossfield",
  "ironwood",
  "high-pastures",
  "crown-road",
  "canal-ward",
  "old-quarter",
  "bellweather-centre"
] as const);

export type DistrictId = (typeof DISTRICT_IDS)[number];

export interface DistrictDefinition {
  readonly id: DistrictId;
  readonly name: string;
  readonly capacity: 2 | 3 | 4 | 6;
  readonly adjacentDistrictIds: readonly DistrictId[];
}

export const DISTRICTS = deepFreeze([
  {
    id: "northreach",
    name: "Northreach",
    capacity: 2,
    adjacentDistrictIds: ["high-pastures", "cloverfield", "crown-road"]
  },
  {
    id: "cloverfield",
    name: "Cloverfield",
    capacity: 4,
    adjacentDistrictIds: ["northreach", "harbormouth"]
  },
  {
    id: "harbormouth",
    name: "Harbormouth",
    capacity: 6,
    adjacentDistrictIds: ["cloverfield", "millbank"]
  },
  {
    id: "millbank",
    name: "Millbank",
    capacity: 4,
    adjacentDistrictIds: ["harbormouth", "reedwater"]
  },
  {
    id: "reedwater",
    name: "Reedwater",
    capacity: 2,
    adjacentDistrictIds: ["millbank", "sunmeadow", "canal-ward"]
  },
  {
    id: "sunmeadow",
    name: "Sunmeadow",
    capacity: 4,
    adjacentDistrictIds: ["reedwater", "grand-market"]
  },
  {
    id: "grand-market",
    name: "Grand Market",
    capacity: 6,
    adjacentDistrictIds: ["sunmeadow", "red-orchard"]
  },
  {
    id: "red-orchard",
    name: "Red Orchard",
    capacity: 4,
    adjacentDistrictIds: ["grand-market", "westgate"]
  },
  {
    id: "westgate",
    name: "Westgate",
    capacity: 2,
    adjacentDistrictIds: ["red-orchard", "mossfield", "old-quarter"]
  },
  {
    id: "mossfield",
    name: "Mossfield",
    capacity: 4,
    adjacentDistrictIds: ["westgate", "ironwood"]
  },
  {
    id: "ironwood",
    name: "Ironwood",
    capacity: 6,
    adjacentDistrictIds: ["mossfield", "high-pastures"]
  },
  {
    id: "high-pastures",
    name: "High Pastures",
    capacity: 4,
    adjacentDistrictIds: ["ironwood", "northreach"]
  },
  {
    id: "crown-road",
    name: "Crown Road",
    capacity: 2,
    adjacentDistrictIds: ["northreach", "bellweather-centre"]
  },
  {
    id: "canal-ward",
    name: "Canal Ward",
    capacity: 2,
    adjacentDistrictIds: ["reedwater", "bellweather-centre"]
  },
  {
    id: "old-quarter",
    name: "Old Quarter",
    capacity: 2,
    adjacentDistrictIds: ["westgate", "bellweather-centre"]
  },
  {
    id: "bellweather-centre",
    name: "Bellweather Centre",
    capacity: 3,
    adjacentDistrictIds: ["crown-road", "canal-ward", "old-quarter"]
  }
] as const satisfies readonly DistrictDefinition[]);

export const DISTRICTS_BY_ID = Object.freeze(
  Object.fromEntries(DISTRICTS.map((district) => [district.id, district])) as {
    readonly [Id in DistrictId]: Extract<
      (typeof DISTRICTS)[number],
      { readonly id: Id }
    >;
  }
);
