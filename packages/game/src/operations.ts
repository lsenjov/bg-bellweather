import {
  BONUS_CARDS_BY_ID,
  PARTY_IDS, DISTRICTS_BY_ID, MAP_BRIDGES,
  type LawEffectId,
  type BonusCardId,
  type DistrictId,
  type PartyId
} from "@bellweather/content";
import type { SupportChange } from "./model.js";

export const PARTIES = PARTY_IDS;
export type Party = PartyId;
export type Operation = "organise" | "rally" | "smear";

export interface DistrictState {
  id: string;
  capacity: number;
  neighbors: readonly string[];
  support: Partial<Record<Party, number>>;
}

export interface OperationState {
  districts: Record<string, DistrictState>;
  laws: readonly LawEffectId[];
}

export type { OperationChoice } from "@bellweather/protocol";
import { OperationChoiceSchema, type OperationChoice } from "@bellweather/protocol";
export type FollowUpId = NonNullable<OperationChoice["followUpOrder"]>[number];

export interface OperationRequest {
  party: Party;
  choice: OperationChoice;
  bonusCardId?: BonusCardId;
}

export interface OperationResolution {
  state: OperationState;
  supportChanges: SupportChange[];
  baselineApplied: boolean;
  bonusApplied: boolean;
  bonusName: string | null;
  failure: string | null;
  bonusFailure: string | null;
}

export interface OperationLegalityOptions {
  allowCanalNetwork?: boolean;
}

export function resolveOperation(
  initialState: OperationState,
  request: OperationRequest
): OperationResolution {
  const parsed = OperationChoiceSchema.safeParse(request.choice);
  if (!parsed.success) return result(cloneState(initialState), false, false, null, "Invalid Operation choice", null, []);
  const state = cloneState(initialState);
  const supportChanges: SupportChange[] = [];
  const operation = request.choice.operation;
  const bonusCard = request.bonusCardId === undefined
    ? undefined
    : BONUS_CARDS_BY_ID[request.bonusCardId];
  const bonusName = bonusCard?.name ?? null;
  if (bonusCard !== undefined && bonusCard.operation !== operation) {
    return result(
      state,
      false,
      false,
      bonusName,
      "The Bonus card choice must match its printed action",
      null,
      supportChanges
    );
  }
  const baseline = applyBaseline(
    state,
    request.party,
    request.choice,
    request.bonusCardId === "riverworks-canal-network",
    supportChanges
  );

  if (!baseline.applied) {
    return result(cloneState(initialState), false, false, bonusName, baseline.failure, null, []);
  }
  const required = triggeredFollowUps(initialState, request, baseline);
  const order = request.choice.followUpOrder ?? required;
  if (order.length !== required.length || new Set(order).size !== order.length || order.some(id => !required.includes(id))) {
    return result(cloneState(initialState), false, false, bonusName, "Resolve every triggered extra exactly once", null, []);
  }
  for (const id of order) {
    const extra = id === "bonus" ? applyBonus(state, request, baseline, supportChanges) : applyLawExtra(state, request, baseline, id, supportChanges);
    if (!extra.applied) return result(cloneState(initialState), false, false, bonusName, extra.failure, extra.failure, []);
  }
  return result(state, true, request.bonusCardId !== undefined, bonusName, null, null, supportChanges);
}

export function operationFollowUps(state: OperationState, request: OperationRequest): FollowUpId[] {
  if (!OperationChoiceSchema.safeParse(request.choice).success) return [];
  const baseline = applyBaseline(cloneState(state), request.party, request.choice, request.bonusCardId === "riverworks-canal-network", []);
  return baseline.applied ? triggeredFollowUps(state, request, baseline) : [];
}

function triggeredFollowUps(state: OperationState, request: OperationRequest, baseline: BaselineResult): FollowUpId[] {
  const ids: FollowUpId[] = [];
  if (request.bonusCardId !== "riverworks-canal-network") {
    if (baseline.wasAbsent && request.choice.operation !== "smear" && state.laws.includes(6)) ids.push(6);
    if (request.choice.operation === "organise" && !baseline.wasAbsent) {
      const source = baseline.sourceDistrictId!, destination = baseline.destinationDistrictId!;
      if (state.laws.includes(17) && DISTRICTS_BY_ID[source as DistrictId]?.regionId !== DISTRICTS_BY_ID[destination as DistrictId]?.regionId) ids.push(17);
      if (state.laws.includes(28)) ids.push(28);
      if (state.laws.includes(29) && MAP_BRIDGES.some(bridge => (bridge.districtIds as readonly string[]).includes(source) && (bridge.districtIds as readonly string[]).includes(destination))) ids.push(29);
    }
  }
  if (request.bonusCardId !== undefined) ids.push("bonus");
  return ids;
}

function applyLawExtra(state: OperationState, request: OperationRequest, baseline: BaselineResult, id: Exclude<FollowUpId, "bonus">, changes: SupportChange[]) {
  const {party, choice} = request;
  if (id === 6) {
    if (!Object.values(state.districts).some(hasFreeSpot)) return bonusApplied();
    const destination = state.districts[choice.freshStartDistrictId ?? ""];
    if (!destination || !hasFreeSpot(destination)) return bonusFailed("Fresh Start requires a second placement in a free district");
    addSupport(destination, party, changes);
    return bonusApplied();
  }
  const source = state.districts[baseline.sourceDistrictId!]!;
  const destination = state.districts[baseline.destinationDistrictId!]!;
  if (id === 17 || id === 29) {
    const target = id === 17 ? source : destination;
    if (hasFreeSpot(target)) addSupport(target, party, changes);
    return bonusApplied();
  }
  const moved = choice.operation === "organise" ? choice.count ?? 1 : 0;
  const eligible = source.neighbors.filter(id => {
    const available = state.districts[id]?.support[party] ?? 0;
    return available - (id === destination.id ? moved : 0) > 0;
  });
  if (!hasFreeSpot(source) || eligible.length === 0) return bonusApplied();
  if (!eligible.includes(choice.chainSourceDistrictId ?? "")) return bonusFailed("Chain Migration requires a different Support from a neighboring district");
  moveSupport(state.districts[choice.chainSourceDistrictId!]!, source, party, changes);
  return bonusApplied();
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
    options.allowCanalNetwork === true,
    []
  ).applied;
}

export function isOperationRequestLegal(
  initialState: OperationState,
  request: OperationRequest
): boolean {
  const resolution = resolveOperation(initialState, request);
  return (
    resolution.baselineApplied &&
    (request.bonusCardId === undefined || resolution.bonusApplied)
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
  state: OperationState, party: Party, choice: OperationChoice,
  allowCanalNetwork: boolean, supportChanges: SupportChange[]
): BaselineResult {
  const wasAbsent = supportCount(state, party) === 0;
  const law = (id: LawEffectId) => !allowCanalNetwork && state.laws.includes(id);
  const region = (id: string) => DISTRICTS_BY_ID[id as DistrictId]?.regionId;
  if (choice.operation === "organise") {
    const count = choice.count ?? 1;
    const swaps = choice.swapPartyIds ?? [];
    if (!Number.isSafeInteger(count) || count < 1 || (!allowCanalNetwork && count > (law(7) ? 2 : 1))) return failed(wasAbsent, "Invalid Organise group size");
    const destination = state.districts[choice.destinationDistrictId];
    if (destination === undefined) return failed(wasAbsent, "Choose an Organise destination");
    if (wasAbsent) {
      if (allowCanalNetwork || count !== 1 || swaps.length || !hasFreeSpot(destination)) return failed(wasAbsent, "An absent party requires one free spot to return");
      addSupport(destination, party, supportChanges);
      return { applied: true, failure: null, wasAbsent, destinationDistrictId: destination.id };
    }
    const source = state.districts[choice.sourceDistrictId ?? ""];
    if (source === undefined || source.id === destination.id || (source.support[party] ?? 0) < count) return failed(wasAbsent, "Organise requires Support in a different source");
    const allowed = source.neighbors.includes(destination.id)
      || (allowCanalNetwork && canalNetworkConnects(state, source.id, destination.id, party))
      || (law(9) && (destination.support[party] ?? 0) > 0)
      || (law(30) && region(source.id) === region(destination.id));
    if (!allowed) return failed(wasAbsent, "Destination is outside Organise range");
    if (swaps.length > count || (swaps.length && !law(10)) || swaps.some(p => p === party || !PARTIES.includes(p))) return failed(wasAbsent, "Political Exchange requires rival Support");
    for (const rival of PARTIES) if (swaps.filter(p => p === rival).length > (destination.support[rival] ?? 0)) return failed(wasAbsent, "Not enough rival Support to swap");
    if (destination.capacity - districtTotal(destination) + swaps.length < count) return failed(wasAbsent, "Destination needs a free spot or swap for every arrival");
    for (let i = 0; i < count; i++) removeSupport(source, party, supportChanges);
    for (const rival of swaps) moveSupport(destination, source, rival, supportChanges);
    for (let i = 0; i < count; i++) addSupport(destination, party, supportChanges);
    // A swap is simultaneous; record each arriving Support as a move for map playback.
    supportChanges.splice(supportChanges.length - count - swaps.length - count, count + swaps.length + count,
      ...Array.from({length: count}, () => ({type: "move" as const, partyId: party, sourceDistrictId: source.id as DistrictId, destinationDistrictId: destination.id as DistrictId})),
      ...swaps.map(rival => ({type: "move" as const, partyId: rival, sourceDistrictId: destination.id as DistrictId, destinationDistrictId: source.id as DistrictId})));
    return { applied: true, failure: null, wasAbsent, sourceDistrictId: source.id, destinationDistrictId: destination.id };
  }
  if (choice.operation === "rally") {
    const destination = state.districts[choice.districtId];
    const source = state.districts[choice.sourceDistrictId ?? choice.districtId];
    if (!destination || !hasFreeSpot(destination)) return failed(wasAbsent, "Rally requires a free spot");
    const allowed = wasAbsent || (source && (source.support[party] ?? 0) > 0 && (
      source.id === destination.id || (law(1) && source.neighbors.includes(destination.id))
      || (law(22) && region(source.id) === region(destination.id) && (destination.support[party] ?? 0) === 0)));
    if (!allowed) return failed(wasAbsent, "Choose a valid Rally source and destination");
    addSupport(destination, party, supportChanges);
    return { applied: true, failure: null, wasAbsent, destinationDistrictId: destination.id };
  }
  const district = state.districts[choice.districtId];
  if (!district || choice.rivalParty === party || (district.support[choice.rivalParty] ?? 0) < 1) return failed(wasAbsent, "Smear requires rival Support");
  const reachable = new Set([district.id, ...district.neighbors]);
  if (law(11)) for (const neighbor of district.neighbors) for (const id of state.districts[neighbor]?.neighbors ?? []) reachable.add(id);
  if (!wasAbsent && !(law(35) && !hasFreeSpot(district)) && ![...reachable].some(id => (state.districts[id]?.support[party] ?? 0) > 0)) return failed(wasAbsent, "Smear target is outside range");
  if (choice.displacementDistrictId !== undefined) {
    const destination = state.districts[choice.displacementDistrictId];
    if (!law(14) || !destination || !district.neighbors.includes(destination.id) || !hasFreeSpot(destination)) return failed(wasAbsent, "Displacement requires a free neighboring district");
    moveSupport(district, destination, choice.rivalParty, supportChanges);
  } else removeSupport(district, choice.rivalParty, supportChanges);
  return { applied: true, failure: null, wasAbsent, affectedDistrictId: district.id, rivalParty: choice.rivalParty };
}

function applyBonus(
  state: OperationState,
  request: OperationRequest,
  baseline: BaselineResult,
  supportChanges: SupportChange[]
): {
  applied: boolean;
  failure: string | null;
} {
  const { party, choice, bonusCardId } = request;
  if (bonusCardId === "honeycomb-waggle-route") {
    return addBonusSupport(
      state,
      baseline.destinationDistrictId,
      party,
      "Waggle Route requires another free destination spot",
      supportChanges
    );
  }
  if (bonusCardId === "old-shell-dig-in") {
    if (baseline.wasAbsent) return bonusFailed("Dig In requires a movement Organise");
    const source = state.districts[baseline.sourceDistrictId!]!;
    if (hasFreeSpot(source)) addSupport(source, party, supportChanges);
    return bonusApplied();
  }
  if (bonusCardId === "old-shell-stonewall") {
    return removeBonusSupport(
      state,
      baseline.affectedDistrictId,
      baseline.rivalParty,
      supportChanges
    );
  }
  if (bonusCardId === "foxglove-spin") {
    return addBonusSupport(
      state,
      baseline.affectedDistrictId,
      party,
      null,
      supportChanges
    );
  }
  if (bonusCardId === "riverworks-canal-network") {
    return baseline.wasAbsent
      ? bonusFailed("Canal Network requires a movement Organise")
      : bonusApplied();
  }
  if (bonusCardId === "riverworks-public-works" && choice.operation === "rally") {
    const source = state.districts[baseline.destinationDistrictId ?? ""];
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (
      source === undefined ||
      destination === undefined ||
      !source.neighbors.includes(destination.id)
    ) {
      return bonusFailed("Public Works requires a neighboring district");
    }
    return addBonusSupport(state, destination.id, party, null, supportChanges);
  }
  if (bonusCardId === "many-wings-scatter-the-flock" && choice.operation === "rally") {
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
      moveSupport(source, state.districts[districtId]!, party, supportChanges);
    }
    return bonusApplied();
  }
  if (
    bonusCardId === "night-parliament-quiet-hours" &&
    choice.operation === "rally"
  ) {
    const destination = state.districts[choice.bonusDistrictId ?? ""];
    if (destination === undefined || districtTotal(destination) !== 0) {
      return bonusFailed("Quiet Hours requires an otherwise empty district");
    }
    addSupport(destination, party, supportChanges);
    return bonusApplied();
  }
  if (bonusCardId === "night-parliament-midnight-leak" && choice.operation === "smear") {
    const source = state.districts[baseline.affectedDistrictId!];
    const eligible = source!.neighbors.filter(id => (state.districts[id]?.support[choice.rivalParty] ?? 0) > 0);
    if (eligible.length === 0) return bonusApplied();
    if (!eligible.includes(choice.bonusDistrictId ?? "")) return bonusFailed("Choose neighboring Support of the same rival for Midnight Leak");
    removeSupport(state.districts[choice.bonusDistrictId!]!, choice.rivalParty, supportChanges);
    return bonusApplied();
  }
  return bonusFailed("The Bonus card does not match this action");
}

function addBonusSupport(
  state: OperationState,
  districtId: string | undefined,
  party: Party,
  failure: string | null,
  supportChanges: SupportChange[]
) {
  const district = state.districts[districtId ?? ""];
  if (district === undefined || !hasFreeSpot(district)) {
    return bonusFailed(failure ?? "The bonus requires another free spot");
  }
  addSupport(district, party, supportChanges);
  return bonusApplied();
}

function removeBonusSupport(
  state: OperationState,
  districtId: string | undefined,
  party: Party | undefined,
  supportChanges: SupportChange[]
) {
  const district = state.districts[districtId ?? ""];
  if (
    district === undefined ||
    party === undefined ||
    (district.support[party] ?? 0) < 1
  ) {
    return bonusFailed("The bonus requires another matching rival Support");
  }
  removeSupport(district, party, supportChanges);
  return bonusApplied();
}

function canalNetworkConnects(
  state: OperationState,
  sourceDistrictId: string,
  destinationDistrictId: string,
  party: Party
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
    if (district === undefined || (district.support[party] ?? 0) < 1) {
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
  bonusFailure: string | null,
  supportChanges: SupportChange[]
): OperationResolution {
  return {
    state,
    supportChanges,
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
    laws: [...state.laws]
  };
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

function addSupport(
  district: DistrictState,
  party: Party,
  supportChanges: SupportChange[]
): void {
  incrementSupport(district, party);
  supportChanges.push({
    type: "add",
    partyId: party,
    destinationDistrictId: district.id as DistrictId
  });
}

function removeSupport(
  district: DistrictState,
  party: Party,
  supportChanges: SupportChange[]
): void {
  decrementSupport(district, party);
  supportChanges.push({
    type: "remove",
    partyId: party,
    sourceDistrictId: district.id as DistrictId
  });
}

function moveSupport(
  source: DistrictState,
  destination: DistrictState,
  party: Party,
  supportChanges: SupportChange[]
): void {
  decrementSupport(source, party);
  incrementSupport(destination, party);
  supportChanges.push({
    type: "move",
    partyId: party,
    sourceDistrictId: source.id as DistrictId,
    destinationDistrictId: destination.id as DistrictId
  });
}

function incrementSupport(district: DistrictState, party: Party): void {
  district.support[party] = (district.support[party] ?? 0) + 1;
}

function decrementSupport(district: DistrictState, party: Party): void {
  const next = (district.support[party] ?? 0) - 1;
  if (next <= 0) {
    delete district.support[party];
  } else {
    district.support[party] = next;
  }
}
