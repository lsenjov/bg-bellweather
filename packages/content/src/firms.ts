import { deepFreeze } from "./immutable.js";

export const FIRM_IDS = deepFreeze([
  "one-fell-swoop",
  "pairliament",
  "triumvirat",
  "ivy-league",
  "vested-interests",
  "vip-access"
] as const);
export type FirmId = (typeof FIRM_IDS)[number];

export interface FirmDefinition {
  readonly id: FirmId;
  readonly number: 1 | 2 | 3 | 4 | 5 | 6;
  readonly numeral: string;
  readonly name: string;
}

export const FIRMS = deepFreeze([
  {
    id: "one-fell-swoop",
    number: 1,
    numeral: "1",
    name: "One Fell Swoop Public Affairs"
  },
  {
    id: "pairliament",
    number: 2,
    numeral: "2",
    name: "Pairliament Partners"
  },
  {
    id: "triumvirat",
    number: 3,
    numeral: "3",
    name: "TriumviRAT Advisory"
  },
  {
    id: "ivy-league",
    number: 4,
    numeral: "IV",
    name: "IVy League Public Affairs"
  },
  {
    id: "vested-interests",
    number: 5,
    numeral: "V",
    name: "Vested Interests"
  },
  {
    id: "vip-access",
    number: 6,
    numeral: "VI",
    name: "VI.P. Access Group"
  }
] as const satisfies readonly FirmDefinition[]);

export const FIRMS_BY_ID = Object.freeze(
  Object.fromEntries(FIRMS.map((firm) => [firm.id, firm])) as {
    readonly [Id in FirmId]: Extract<
      (typeof FIRMS)[number],
      { readonly id: Id }
    >;
  }
);
