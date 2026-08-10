import type { DistrictId } from "./districts.js";
import { deepFreeze } from "./immutable.js";
import type { OperationId } from "./parties.js";

export interface PlayerSetup {
  readonly firms: 1 | 2;
  readonly leverage: number;
  readonly bluff: number;
  readonly operations: Readonly<Record<OperationId, number>>;
  readonly points: number;
  readonly openingBids: 1 | 2;
  readonly identityCards: 3 | 6;
  readonly counterbidSlots: 2 | 4;
}

export const STANDARD_PLAYER_SETUP = deepFreeze({
  firms: 1,
  leverage: 10,
  bluff: 4,
  operations: {
    organise: 2,
    rally: 4,
    smear: 2,
    court: 2
  },
  points: 5,
  openingBids: 1,
  identityCards: 3,
  counterbidSlots: 2
} as const satisfies PlayerSetup);

export const DOUBLED_PLAYER_SETUP = deepFreeze({
  firms: 2,
  leverage: 20,
  bluff: 8,
  operations: {
    organise: 4,
    rally: 8,
    smear: 4,
    court: 4
  },
  points: 10,
  openingBids: 2,
  identityCards: 6,
  counterbidSlots: 4
} as const satisfies PlayerSetup);

export const INITIAL_SUPPORT_DISTRICTS = deepFreeze([
  "harbormouth",
  "grand-market",
  "ironwood"
] as const satisfies readonly DistrictId[]);

export const SUPPORT_SUPPLY = "unlimited" as const;
export const ELECTION_ROUNDS = deepFreeze([4, 8, 12] as const);
export const RULESET_VERSION = "12" as const;
