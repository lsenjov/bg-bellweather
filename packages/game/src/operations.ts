export const PARTIES = [
  "honeycomb",
  "old-shell",
  "foxglove",
  "riverworks",
  "many-wings",
  "night-parliament"
] as const;

export type Party = (typeof PARTIES)[number];
export type Operation = "organise" | "rally" | "smear" | "court";

export interface DistrictState {
  id: string;
  capacity: number;
  neighbors: readonly string[];
  support: Partial<Record<Party, number>>;
}

export interface OperationState {
  districts: Record<string, DistrictState>;
  courtSupport: Record<Party, Partial<Record<Party, number>>>;
  coalitionTargets: Record<Party, Party | null>;
}

export type OperationChoice =
  | {
      operation: "organise";
      destinationDistrictId: string;
      sourceDistrictId?: string;
    }
  | { operation: "rally"; districtId: string; bonusDistrictId?: string }
  | {
      operation: "smear";
      districtId: string;
      rivalParty: Party;
      bonusDistrictId?: string;
    }
  | {
      operation: "court";
      targetParty: Party;
      bonusDistrictId?: string;
    };

export interface NightDelayedClaim {
  id: string;
  ownerId: string;
  bidRank: number;
  order: number;
  operation: "rally" | "court";
}

export interface OperationRequest {
  party: Party;
  choice: OperationChoice;
  claimBonus?: boolean;
  repeatChoice?: Extract<OperationChoice, { operation: "organise" }>;
  nightClaim?: Omit<NightDelayedClaim, "operation">;
}

export interface OperationResolution {
  state: OperationState;
  baselineApplied: boolean;
  bonusApplied: boolean;
  bonusName: string | null;
  delayedClaim: NightDelayedClaim | null;
  failure: string | null;
  bonusFailure: string | null;
}

export interface OperationLegalityOptions {
  ignoreOrganiseAdjacency?: boolean;
}

export interface DelayedResolution {
  claim: NightDelayedClaim;
  applied: boolean;
  failure: string | null;
}

export const PARTY_BONUSES: Record<
  Party,
  Partial<Record<Operation, string>>
> = {
  honeycomb: {
    organise: "Leave a Cell Behind",
    rally: "Swarm"
  },
  "old-shell": {
    smear: "Stonewall",
    court: "Binding Pact"
  },
  foxglove: {
    organise: "Slip Away",
    smear: "Spin"
  },
  riverworks: {
    rally: "Public Works",
    smear: "Undermine"
  },
  "many-wings": {
    organise: "Murmuration",
    court: "Local Chapters"
  },
  "night-parliament": {
    rally: "Closing Argument",
    court: "After-Hours Deal"
  }
};

export function resolveOperation(
  initialState: OperationState,
  request: OperationRequest
): OperationResolution {
  const state = cloneState(initialState);
  const operation = request.choice.operation;
  const bonusName = PARTY_BONUSES[request.party][operation] ?? null;
  const baseline = applyBaseline(
    state,
    request.party,
    request.choice,
    request.party === "foxglove" &&
      operation === "organise" &&
      request.claimBonus === true
  );

  if (!baseline.applied) {
    return result(state, false, false, bonusName, null, baseline.failure, null);
  }
  if (request.claimBonus !== true || bonusName === null) {
    return result(state, true, false, bonusName, null, null, null);
  }

  const bonus = applyBonus(state, request, baseline);
  if (!bonus.applied) {
    return result(
      cloneState(initialState),
      false,
      false,
      bonusName,
      null,
      "The claimed immediate bonus cannot resolve",
      bonus.failure
    );
  }
  return result(
    state,
    true,
    bonus.applied,
    bonusName,
    bonus.delayedClaim,
    null,
    bonus.failure
  );
}

export function resolveNightDelayedOperations(
  initialState: OperationState,
  claims: readonly NightDelayedClaim[],
  choices: Readonly<Record<string, OperationChoice>>
): {
  state: OperationState;
  resolutions: DelayedResolution[];
} {
  const state = cloneState(initialState);
  const resolutions = [...claims]
    .sort((left, right) => left.bidRank - right.bidRank || left.order - right.order)
    .map((claim): DelayedResolution => {
      const choice = choices[claim.id];
      if (choice === undefined || choice.operation !== claim.operation) {
        return {
          claim,
          applied: false,
          failure: "A matching delayed-operation choice is required"
        };
      }
      const baseline = applyBaseline(state, "night-parliament", choice, false);
      return { claim, applied: baseline.applied, failure: baseline.failure };
    });

  return { state, resolutions };
}

export function supportCount(state: OperationState, party?: Party): number {
  return Object.values(state.districts).reduce(
    (total, district) =>
      total +
      (party === undefined
        ? PARTIES.reduce(
            (districtTotal, candidate) =>
              districtTotal + (district.support[candidate] ?? 0),
            0
          )
        : (district.support[party] ?? 0)),
    0
  );
}

export function isOperationChoiceLegal(
  initialState: OperationState,
  party: Party,
  choice: OperationChoice,
  options: OperationLegalityOptions = {}
): boolean {
  return applyBaseline(
    cloneState(initialState),
    party,
    choice,
    options.ignoreOrganiseAdjacency === true
  ).applied;
}

export function isOperationRequestLegal(
  initialState: OperationState,
  request: OperationRequest
): boolean {
  const preparedRequest =
    request.claimBonus === true &&
    request.party === "night-parliament" &&
    (request.choice.operation === "rally" ||
      request.choice.operation === "court") &&
    request.nightClaim === undefined
      ? {
          ...request,
          nightClaim: {
            id: "legality-check",
            ownerId: "legality-check",
            bidRank: 0,
            order: 0
          }
        }
      : request;
  const resolution = resolveOperation(initialState, preparedRequest);
  return (
    resolution.baselineApplied &&
    (request.claimBonus !== true ||
      resolution.bonusApplied ||
      resolution.delayedClaim !== null)
  );
}

export function hasLegalOperationChoice(
  state: OperationState,
  party: Party,
  operation: Operation,
  options: OperationLegalityOptions = {}
): boolean {
  const districts = Object.values(state.districts);
  if (operation === "organise") {
    if (supportCount(state, party) === 0) {
      return districts.some((destination) =>
        isOperationChoiceLegal(
          state,
          party,
          {
            operation,
            destinationDistrictId: destination.id
          },
          options
        )
      );
    }
    return districts.some((source) =>
      districts.some((destination) =>
        isOperationChoiceLegal(
          state,
          party,
          {
            operation,
            sourceDistrictId: source.id,
            destinationDistrictId: destination.id
          },
          options
        )
      )
    );
  }
  if (operation === "rally") {
    return districts.some((district) =>
      isOperationChoiceLegal(state, party, {
        operation,
        districtId: district.id
      })
    );
  }
  if (operation === "smear") {
    return districts.some((district) =>
      PARTIES.some((rivalParty) =>
        isOperationChoiceLegal(state, party, {
          operation,
          districtId: district.id,
          rivalParty
        })
      )
    );
  }
  return PARTIES.some((targetParty) =>
    isOperationChoiceLegal(state, party, { operation, targetParty })
  );
}

interface BaselineResult {
  applied: boolean;
  failure: string | null;
  wasAbsent: boolean;
  sourceDistrictId?: string;
  destinationDistrictId?: string;
  affectedDistrictId?: string;
  rivalParty?: Party;
  courtTarget?: Party;
}

function applyBaseline(
  state: OperationState,
  party: Party,
  choice: OperationChoice,
  ignoreOrganiseAdjacency: boolean
): BaselineResult {
  const wasAbsent = supportCount(state, party) === 0;
  if (choice.operation === "organise") {
    const destination = state.districts[choice.destinationDistrictId];
    if (destination === undefined || !hasFreeSpot(destination)) {
      return failed(wasAbsent, "Organise requires a free destination spot");
    }
    if (wasAbsent) {
      addSupport(destination, party);
      return {
        applied: true,
        failure: null,
        wasAbsent,
        destinationDistrictId: destination.id
      };
    }
    const source =
      choice.sourceDistrictId === undefined
        ? undefined
        : state.districts[choice.sourceDistrictId];
    if (
      source === undefined ||
      source.id === destination.id ||
      (source.support[party] ?? 0) < 1
    ) {
      return failed(wasAbsent, "Organise requires party Support in a different source");
    }
    if (
      !ignoreOrganiseAdjacency &&
      !source.neighbors.includes(destination.id)
    ) {
      return failed(wasAbsent, "Organise destination must neighbor the source");
    }
    removeSupport(source, party);
    addSupport(destination, party);
    return {
      applied: true,
      failure: null,
      wasAbsent,
      sourceDistrictId: source.id,
      destinationDistrictId: destination.id
    };
  }

  if (choice.operation === "rally") {
    const district = state.districts[choice.districtId];
    if (
      district === undefined ||
      !hasFreeSpot(district) ||
      (!wasAbsent && (district.support[party] ?? 0) === 0)
    ) {
      return failed(
        wasAbsent,
        wasAbsent
          ? "Rally requires any free district"
          : "Rally requires a free spot where the party is present"
      );
    }
    addSupport(district, party);
    return {
      applied: true,
      failure: null,
      wasAbsent,
      destinationDistrictId: district.id
    };
  }

  if (choice.operation === "smear") {
    const district = state.districts[choice.districtId];
    if (
      district === undefined ||
      choice.rivalParty === party ||
      (district.support[choice.rivalParty] ?? 0) < 1
    ) {
      return failed(wasAbsent, "Smear requires rival Support");
    }
    const inRange =
      wasAbsent ||
      (district.support[party] ?? 0) > 0 ||
      district.neighbors.some(
        (neighborId) =>
          (state.districts[neighborId]?.support[party] ?? 0) > 0
      );
    if (!inRange) {
      return failed(wasAbsent, "Smear target is outside the party's range");
    }
    removeSupport(district, choice.rivalParty);
    return {
      applied: true,
      failure: null,
      wasAbsent,
      affectedDistrictId: district.id,
      rivalParty: choice.rivalParty
    };
  }

  if (choice.targetParty === party) {
    return failed(wasAbsent, "Court must choose another party");
  }
  placeCourtSupport(state, party, choice.targetParty);
  return {
    applied: true,
    failure: null,
    wasAbsent,
    courtTarget: choice.targetParty
  };
}

function applyBonus(
  state: OperationState,
  request: OperationRequest,
  baseline: BaselineResult
): {
  applied: boolean;
  failure: string | null;
  delayedClaim: NightDelayedClaim | null;
} {
  const { party, choice } = request;
  if (party === "honeycomb" && choice.operation === "organise") {
    const districtId = baseline.wasAbsent
      ? baseline.destinationDistrictId
      : baseline.sourceDistrictId;
    return addBonusSupport(state, districtId, party, null);
  }
  if (party === "honeycomb" && choice.operation === "rally") {
    return addBonusSupport(
      state,
      baseline.destinationDistrictId,
      party,
      null
    );
  }
  if (party === "old-shell" && choice.operation === "smear") {
    return removeBonusSupport(
      state,
      baseline.affectedDistrictId,
      baseline.rivalParty
    );
  }
  if (party === "old-shell" && choice.operation === "court") {
    placeCourtSupport(state, party, baseline.courtTarget!);
    return bonusApplied();
  }
  if (party === "foxglove" && choice.operation === "organise") {
    return baseline.wasAbsent
      ? bonusFailed("Slip Away cannot be claimed while Foxglove is absent")
      : bonusApplied();
  }
  if (party === "foxglove" && choice.operation === "smear") {
    return addBonusSupport(
      state,
      baseline.affectedDistrictId,
      party,
      null
    );
  }
  if (party === "riverworks" && choice.operation === "rally") {
    const source = state.districts[baseline.destinationDistrictId ?? ""];
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (
      source === undefined ||
      destination === undefined ||
      !source.neighbors.includes(destination.id)
    ) {
      return bonusFailed("Public Works requires a neighboring district");
    }
    return addBonusSupport(state, destination.id, party, null);
  }
  if (party === "riverworks" && choice.operation === "smear") {
    const source = state.districts[baseline.affectedDistrictId ?? ""];
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (
      source === undefined ||
      destination === undefined ||
      !source.neighbors.includes(destination.id)
    ) {
      return bonusFailed("Undermine requires a neighboring district");
    }
    return removeBonusSupport(state, destination.id, baseline.rivalParty);
  }
  if (party === "many-wings" && choice.operation === "organise") {
    if (request.repeatChoice === undefined) {
      return bonusFailed("Murmuration requires a second Organise choice");
    }
    const repeat = applyBaseline(
      state,
      party,
      request.repeatChoice,
      false
    );
    return repeat.applied ? bonusApplied() : bonusFailed(repeat.failure);
  }
  if (party === "many-wings" && choice.operation === "court") {
    const coalitionTarget = state.coalitionTargets[party];
    const district = state.districts[choice.bonusDistrictId ?? ""];
    if (
      coalitionTarget === null ||
      district === undefined ||
      !hasFreeSpot(district) ||
      (district.support[coalitionTarget] ?? 0) < 1
    ) {
      return bonusFailed(
        "Local Chapters requires a current Coalition Target with Support in a free district"
      );
    }
    addSupport(district, party);
    return bonusApplied();
  }
  if (
    party === "night-parliament" &&
    (choice.operation === "rally" || choice.operation === "court")
  ) {
    if (request.nightClaim === undefined) {
      return bonusFailed("A Night Parliament delayed claim identity is required");
    }
    return {
      applied: true,
      failure: null,
      delayedClaim: {
        ...request.nightClaim,
        operation: choice.operation
      }
    };
  }
  return bonusFailed("This party has no matching bonus");
}

function addBonusSupport(
  state: OperationState,
  districtId: string | undefined,
  party: Party,
  failure: string | null
) {
  const district = state.districts[districtId ?? ""];
  if (district === undefined || !hasFreeSpot(district)) {
    return bonusFailed(failure ?? "The bonus requires another free spot");
  }
  addSupport(district, party);
  return bonusApplied();
}

function removeBonusSupport(
  state: OperationState,
  districtId: string | undefined,
  party: Party | undefined
) {
  const district = state.districts[districtId ?? ""];
  if (
    district === undefined ||
    party === undefined ||
    (district.support[party] ?? 0) < 1
  ) {
    return bonusFailed("The bonus requires another matching rival Support");
  }
  removeSupport(district, party);
  return bonusApplied();
}

function bonusApplied() {
  return { applied: true, failure: null, delayedClaim: null };
}

function bonusFailed(failure: string | null) {
  return {
    applied: false,
    failure: failure ?? "The bonus is illegal",
    delayedClaim: null
  };
}

function result(
  state: OperationState,
  baselineApplied: boolean,
  bonusAppliedValue: boolean,
  bonusName: string | null,
  delayedClaim: NightDelayedClaim | null,
  failure: string | null,
  bonusFailure: string | null
): OperationResolution {
  return {
    state,
    baselineApplied,
    bonusApplied: bonusAppliedValue,
    bonusName,
    delayedClaim,
    failure,
    bonusFailure
  };
}

function failed(wasAbsent: boolean, failure: string): BaselineResult {
  return { applied: false, failure, wasAbsent };
}

function cloneState(state: OperationState): OperationState {
  return {
    districts: Object.fromEntries(
      Object.entries(state.districts).map(([id, district]) => [
        id,
        {
          ...district,
          neighbors: [...district.neighbors],
          support: { ...district.support }
        }
      ])
    ),
    courtSupport: Object.fromEntries(
      PARTIES.map((party) => [party, { ...state.courtSupport[party] }])
    ) as OperationState["courtSupport"],
    coalitionTargets: { ...state.coalitionTargets },
  };
}

function placeCourtSupport(
  state: OperationState,
  party: Party,
  targetParty: Party
): void {
  const support = state.courtSupport[party];
  support[targetParty] = (support[targetParty] ?? 0) + 1;
  const ranked = PARTIES.filter((candidate) => candidate !== party)
    .map((candidate) => ({
      party: candidate,
      support: support[candidate] ?? 0
    }))
    .sort((left, right) => right.support - left.support);
  if (ranked[0]!.support > ranked[1]!.support) {
    state.coalitionTargets[party] = ranked[0]!.party;
  }
}

function hasFreeSpot(district: DistrictState): boolean {
  return districtTotal(district) < district.capacity;
}

function districtTotal(district: DistrictState): number {
  return PARTIES.reduce(
    (total, party) => total + (district.support[party] ?? 0),
    0
  );
}

function addSupport(district: DistrictState, party: Party): void {
  district.support[party] = (district.support[party] ?? 0) + 1;
}

function removeSupport(district: DistrictState, party: Party): void {
  const next = (district.support[party] ?? 0) - 1;
  if (next <= 0) {
    delete district.support[party];
  } else {
    district.support[party] = next;
  }
}
