import type { DistrictId } from "./districts.js";
import { deepFreeze } from "./immutable.js";
import type { OperationId } from "./parties.js";

export interface PlayerSetup {
  readonly firms: 1 | 2;
  readonly clout: number;
  readonly operations: Readonly<Record<OperationId, number>>;
  readonly points: number;
  readonly openingBidMarkers: 1 | 2;
  readonly counterbidSlots: 2 | 4;
}

export const STANDARD_PLAYER_SETUP = deepFreeze({
  firms: 1,
  clout: 10,
  operations: {
    organise: 2,
    rally: 2,
    smear: 2,
    court: 1
  },
  points: 5,
  openingBidMarkers: 1,
  counterbidSlots: 2
} as const satisfies PlayerSetup);

export const DOUBLED_PLAYER_SETUP = deepFreeze({
  firms: 2,
  clout: 20,
  operations: {
    organise: 4,
    rally: 4,
    smear: 4,
    court: 2
  },
  points: 10,
  openingBidMarkers: 2,
  counterbidSlots: 4
} as const satisfies PlayerSetup);

export const INITIAL_SUPPORT_DISTRICTS = deepFreeze([
  "harbormouth",
  "grand-market",
  "ironwood"
] as const satisfies readonly DistrictId[]);

export const SUPPORT_SUPPLY = "unlimited" as const;
export const ELECTION_ROUNDS = deepFreeze([4, 8, 12] as const);
export const RULESET_VERSION = "1" as const;
export const rulesetVersion = RULESET_VERSION;
