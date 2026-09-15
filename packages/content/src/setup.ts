import type { DistrictId } from "./districts.js";
import { deepFreeze } from "./immutable.js";
import type { OperationId } from "./parties.js";

export interface PlayerSetup {
  readonly firms: 1 | 2;
  readonly operations: Readonly<Record<OperationId, number>>;
  readonly points: number;
  readonly collectionCounters: 2 | 4;
}

export const STANDARD_PLAYER_SETUP = deepFreeze({
  firms: 1,
  operations: {
    organise: 3,
    rally: 4,
    smear: 2
  },
  points: 0,
  collectionCounters: 2
} as const satisfies PlayerSetup);

export const DOUBLED_PLAYER_SETUP = deepFreeze({
  firms: 2,
  operations: {
    organise: 6,
    rally: 8,
    smear: 4
  },
  points: 0,
  collectionCounters: 4
} as const satisfies PlayerSetup);

export const INITIAL_SUPPORT_DISTRICTS = deepFreeze([
  "harbormouth",
  "grand-market",
  "ironwood"
] as const satisfies readonly DistrictId[]);

export const SUPPORT_SUPPLY = "unlimited" as const;
export const ELECTION_YEARS = deepFreeze([2, 4, 6] as const);
export type ElectionYear = (typeof ELECTION_YEARS)[number];
export const FINAL_ELECTION_YEAR = ELECTION_YEARS[2];
export const RULESET_VERSION = "26" as const;
