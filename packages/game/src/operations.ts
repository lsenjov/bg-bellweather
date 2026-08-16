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
  | {
      operation: "rally";
      districtId: string;
      bonusDistrictId?: string;
      bonusDistrictIds?: string[];
    }
  | {
      operation: "smear";
      districtId: string;
      rivalParty: Party;
      bonusCourtParty?: Party;
    }
  | {
      operation: "court";
      targetParty: Party;
      bonusDistrictId?: string;
      bonusSourceDistrictId?: string;
      bonusCourtSourceParty?: Party;
    };

export interface OperationRequest {
  party: Party;
  choice: OperationChoice;
  claimBonus?: boolean;
}

export interface OperationResolution {
  state: OperationState;
  baselineApplied: boolean;
  bonusApplied: boolean;
  bonusName: string | null;
  failure: string | null;
  bonusFailure: string | null;
}

export interface OperationLegalityOptions {
  allowCanalNetwork?: boolean;
}

export const PARTY_BONUSES: Record<
  Party,
  Partial<Record<Operation, string>>
> = {
  honeycomb: {
    organise: "Waggle Route",
    court: "Common Cause"
  },
  "old-shell": {
    organise: "Dig In",
    smear: "Stonewall"
  },
  foxglove: {
    smear: "Spin",
    court: "Whisper Network"
  },
  riverworks: {
    organise: "Canal Network",
    rally: "Public Works"
  },
  "many-wings": {
    rally: "Scatter the Flock",
    court: "Joint Campaign"
  },
  "night-parliament": {
    rally: "Quiet Hours",
    smear: "Midnight Leak"
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
    request.party === "riverworks" &&
      operation === "organise" &&
      request.claimBonus === true
  );

  if (!baseline.applied) {
    return result(state, false, false, bonusName, baseline.failure, null);
  }
  if (request.claimBonus !== true || bonusName === null) {
    return result(state, true, false, bonusName, null, null);
  }

  const bonus = applyBonus(state, request, baseline);
  if (!bonus.applied) {
    return result(
      cloneState(initialState),
      false,
      false,
      bonusName,
      "The claimed immediate bonus cannot resolve",
      bonus.failure
    );
  }
  return result(
    state,
    true,
    bonus.applied,
    bonusName,
    null,
    bonus.failure
  );
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
    options.allowCanalNetwork === true
  ).applied;
}

export function isOperationRequestLegal(
  initialState: OperationState,
  request: OperationRequest
): boolean {
  const resolution = resolveOperation(initialState, request);
  return (
    resolution.baselineApplied &&
    (request.claimBonus !== true || resolution.bonusApplied)
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
}

function applyBaseline(
  state: OperationState,
  party: Party,
  choice: OperationChoice,
  allowCanalNetwork: boolean
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
      !source.neighbors.includes(destination.id) &&
      !(
        allowCanalNetwork &&
        party === "riverworks" &&
        canalNetworkConnects(state, source.id, destination.id)
      )
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
    wasAbsent
  };
}

function applyBonus(
  state: OperationState,
  request: OperationRequest,
  baseline: BaselineResult
): {
  applied: boolean;
  failure: string | null;
} {
  const { party, choice } = request;
  if (party === "honeycomb" && choice.operation === "organise") {
    return addBonusSupport(
      state,
      baseline.destinationDistrictId,
      party,
      "Waggle Route requires another free destination spot"
    );
  }
  if (party === "honeycomb" && choice.operation === "court") {
    const source = state.districts[choice.bonusSourceDistrictId ?? ""];
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (
      state.coalitionTargets[party] !== choice.targetParty ||
      source === undefined ||
      destination === undefined ||
      source.id === destination.id ||
      (source.support[party] ?? 0) < 1 ||
      (destination.support[choice.targetParty] ?? 0) < 1 ||
      !hasFreeSpot(destination)
    ) {
      return bonusFailed(
        "Common Cause requires Honeycomb's selected Coalition Target, a Honeycomb source, and a distinct free district containing that target's Support"
      );
    }
    removeSupport(source, party);
    addSupport(destination, party);
    return bonusApplied();
  }
  if (party === "old-shell" && choice.operation === "organise") {
    return baseline.wasAbsent
      ? bonusFailed("Dig In cannot be claimed while Old Shell is absent")
      : addBonusSupport(
          state,
          baseline.sourceDistrictId,
          party,
          "Dig In requires a free source spot"
        );
  }
  if (party === "old-shell" && choice.operation === "smear") {
    return removeBonusSupport(
      state,
      baseline.affectedDistrictId,
      baseline.rivalParty
    );
  }
  if (party === "foxglove" && choice.operation === "smear") {
    return addBonusSupport(
      state,
      baseline.affectedDistrictId,
      party,
      null
    );
  }
  if (party === "foxglove" && choice.operation === "court") {
    const sourceParty = choice.bonusCourtSourceParty;
    if (
      sourceParty === undefined ||
      sourceParty === party ||
      sourceParty === choice.targetParty ||
      (state.courtSupport[party][sourceParty] ?? 0) < 1
    ) {
      return bonusFailed(
        "Whisper Network requires Foxglove Court Support on a different Court space"
      );
    }
    removeCourtSupport(state, party, sourceParty);
    placeCourtSupport(state, party, choice.targetParty);
    return bonusApplied();
  }
  if (party === "riverworks" && choice.operation === "organise") {
    return baseline.wasAbsent
      ? bonusFailed("Canal Network cannot be claimed while Riverworks is absent")
      : bonusApplied();
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
  if (party === "many-wings" && choice.operation === "rally") {
    const source = state.districts[baseline.destinationDistrictId ?? ""];
    const destinations = choice.bonusDistrictIds ?? [];
    if (source === undefined) {
      return bonusFailed("Scatter the Flock requires the Rally district");
    }
    const eligible = source.neighbors.filter((districtId) => {
      const district = state.districts[districtId];
      return district !== undefined && hasFreeSpot(district);
    });
    const count = Math.min(source.support[party] ?? 0, eligible.length);
    if (
      count === 0 ||
      destinations.length !== count ||
      new Set(destinations).size !== destinations.length ||
      destinations.some((districtId) => !eligible.includes(districtId))
    ) {
      return bonusFailed(
        "Scatter the Flock requires the maximum number of distinct free neighboring districts"
      );
    }
    for (const districtId of destinations) {
      removeSupport(source, party);
      addSupport(state.districts[districtId]!, party);
    }
    return bonusApplied();
  }
  if (party === "many-wings" && choice.operation === "court") {
    const district = state.districts[choice.bonusDistrictId ?? ""];
    if (
      district === undefined ||
      !hasFreeSpot(district) ||
      (district.support[party] ?? 0) < 1
    ) {
      return bonusFailed(
        "Joint Campaign requires a free district containing Many Wings Support"
      );
    }
    addSupport(district, choice.targetParty);
    return bonusApplied();
  }
  if (
    party === "night-parliament" &&
    choice.operation === "rally"
  ) {
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (destination === undefined || districtTotal(destination) !== 0) {
      return bonusFailed("Quiet Hours requires an otherwise empty district");
    }
    addSupport(destination, party);
    return bonusApplied();
  }
  if (party === "night-parliament" && choice.operation === "smear") {
    const rivalParty = baseline.rivalParty;
    const courtParty = choice.bonusCourtParty;
    if (
      rivalParty === undefined ||
      courtParty === undefined ||
      (state.courtSupport[rivalParty][courtParty] ?? 0) < 1
    ) {
      return bonusFailed(
        "Midnight Leak requires rival Court Support on the selected Court space"
      );
    }
    removeCourtSupport(state, rivalParty, courtParty);
    updateCoalitionTarget(state, rivalParty);
    return bonusApplied();
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

function canalNetworkConnects(
  state: OperationState,
  sourceDistrictId: string,
  destinationDistrictId: string
): boolean {
  const visited = new Set<string>();
  const pending = [sourceDistrictId];
  while (pending.length > 0) {
    const districtId = pending.shift()!;
    if (visited.has(districtId)) {
      continue;
    }
    visited.add(districtId);
    const district = state.districts[districtId];
    if (district === undefined || (district.support.riverworks ?? 0) < 1) {
      continue;
    }
    if (district.neighbors.includes(destinationDistrictId)) {
      return true;
    }
    pending.push(...district.neighbors);
  }
  return false;
}

function bonusApplied() {
  return { applied: true, failure: null };
}

function bonusFailed(failure: string | null) {
  return {
    applied: false,
    failure: failure ?? "The bonus is illegal"
  };
}

function result(
  state: OperationState,
  baselineApplied: boolean,
  bonusAppliedValue: boolean,
  bonusName: string | null,
  failure: string | null,
  bonusFailure: string | null
): OperationResolution {
  return {
    state,
    baselineApplied,
    bonusApplied: bonusAppliedValue,
    bonusName,
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
  updateCoalitionTarget(state, party);
}

function removeCourtSupport(
  state: OperationState,
  party: Party,
  targetParty: Party
): void {
  const support = state.courtSupport[party];
  const next = (support[targetParty] ?? 0) - 1;
  if (next <= 0) {
    delete support[targetParty];
  } else {
    support[targetParty] = next;
  }
}

function updateCoalitionTarget(state: OperationState, party: Party): void {
  const support = state.courtSupport[party];
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
