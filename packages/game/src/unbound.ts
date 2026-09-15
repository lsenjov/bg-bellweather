import { UnboundBonusChoiceSchema } from "@bellweather/protocol";
import {
  DISTRICTS_BY_ID,
  DISTRICT_IDS,
  FIRM_IDS,
  OPERATION_IDS,
  PARTY_IDS,
  POLICIES_BY_ID, votesFor, type RegionId,
  type BonusCardId,
  type DistrictId,
  type FirmId,
  type PartyId,
  type PolicyId
} from "@bellweather/content";
import type {
  GameState,
  OperationInventory,
  SeatId,
  SupportChange
} from "./model.js";
import { GameRuleError } from "./model.js";

export type UnboundState = Pick<GameState, "parties" | "support" | "pendingPolicies"> & { seats: Array<{ id: SeatId; firmIds: readonly FirmId[] }> };

export type UnboundBonusChoice =
  | { effect: "every_bee_counts" }
  | { effect: "common_cause"; districtId: DistrictId; partnerPartyId: PartyId }
  | { effect: "whisper_network"; sourceDistrictId: DistrictId; destinationDistrictId: DistrictId; rivalPartyId: PartyId }
  | { effect: "joint_campaign"; regionId: RegionId; forPolicy: boolean; destinationDistrictId: DistrictId; moves: Array<{sourceDistrictId: DistrictId; partyId: PartyId}> }
  | {
      effect: "institutional_memory";
      regionId: RegionId;
      forPolicy: boolean;
      placements: Array<{ partyId: PartyId; destinationDistrictId: DistrictId }>;
    }
  | { effect: "shell_firm"; targetPartyId: PartyId }
  | {
      effect: "mass_transit";
      districtIds: DistrictId[];
      supportPartyIds: PartyId[];
    }
  | { effect: "empty_every_nest"; sourceDistrictIds: DistrictId[]; destinationDistrictIds: DistrictId[] }
  | { effect: "midnight_session"; targetPartyId: PartyId; firmId: FirmId };

export interface UnboundBonusResolution {
  choice: UnboundBonusChoice;
  endsLobbyAction: boolean;
  supportChanges: SupportChange[];
}

const UNBOUND_EFFECTS = {
  "honeycomb-common-cause": "common_cause",
  "foxglove-whisper-network": "whisper_network",
  "many-wings-joint-campaign": "joint_campaign",
  "honeycomb-every-bee-counts": "every_bee_counts",
  "old-shell-institutional-memory": "institutional_memory",
  "foxglove-shell-firm": "shell_firm",
  "riverworks-mass-transit": "mass_transit",
  "many-wings-empty-every-nest": "empty_every_nest",
  "night-parliament-midnight-session": "midnight_session"
} as const satisfies Partial<Record<BonusCardId, UnboundBonusChoice["effect"]>>;

export function resolveUnboundBonus(
  state: UnboundState,
  seatId: SeatId,
  actingPartyId: PartyId,
  bonusCardId: BonusCardId,
  value: unknown
): UnboundBonusResolution {
  const choice = unboundBonusChoice(value);
  const supportChanges: SupportChange[] = [];
  if (UNBOUND_EFFECTS[bonusCardId as keyof typeof UNBOUND_EFFECTS] !== choice.effect) {
    throw new GameRuleError(
      "unbound_choice_mismatch",
      "The choice must match the Unbound Bonus card"
    );
  }

  if (choice.effect === "every_bee_counts") {
    everyBeeCounts(state, actingPartyId, supportChanges);
  } else if (choice.effect === "common_cause") {
    const policy = pendingPolicy(state, DISTRICTS_BY_ID[choice.districtId].regionId);
    if (choice.partnerPartyId === "honeycomb" || votesFor(choice.partnerPartyId, policy) !== votesFor("honeycomb", policy)
      || (state.support[choice.districtId][choice.partnerPartyId] ?? 0) === 0
      || freeSpots(state, choice.districtId) < 2) illegalBonus("Common Cause requires a same-voting partner and two free spots");
    addSupport(state, choice.districtId, "honeycomb", supportChanges);
    addSupport(state, choice.districtId, choice.partnerPartyId, supportChanges);
  } else if (choice.effect === "whisper_network") {
    if (choice.rivalPartyId === actingPartyId || (state.support[choice.sourceDistrictId][actingPartyId] ?? 0) === 0
      || (state.support[choice.sourceDistrictId][choice.rivalPartyId] ?? 0) === 0
      || !adjacent(choice.sourceDistrictId, choice.destinationDistrictId) || !hasFreeSpot(state, choice.destinationDistrictId)) illegalBonus("Whisper Network requires a rival alongside acting-party Support and a free neighbor");
    moveSupport(state, choice.sourceDistrictId, choice.destinationDistrictId, choice.rivalPartyId, supportChanges);
  } else if (choice.effect === "joint_campaign") {
    const policy = pendingPolicy(state, choice.regionId);
    if (DISTRICTS_BY_ID[choice.destinationDistrictId].regionId !== choice.regionId || freeSpots(state, choice.destinationDistrictId) < choice.moves.length) illegalBonus("Joint Campaign requires room in the selected region");
    for (const move of choice.moves) {
      if (!adjacent(move.sourceDistrictId, choice.destinationDistrictId) || votesFor(move.partyId, policy) !== choice.forPolicy || (state.support[move.sourceDistrictId][move.partyId] ?? 0) < 1) illegalBonus("Every campaign Support must neighbor the destination and vote on the selected side");
      moveSupport(state, move.sourceDistrictId, choice.destinationDistrictId, move.partyId, supportChanges);
    }
  } else if (choice.effect === "institutional_memory") {
    institutionalMemory(state, choice, supportChanges);
  } else if (choice.effect === "shell_firm") {
    shellFirm(state, actingPartyId, choice.targetPartyId);
  } else if (choice.effect === "mass_transit") {
    massTransit(state, choice, supportChanges);
  } else if (choice.effect === "empty_every_nest") {
    emptyEveryNest(
      state,
      actingPartyId,
      choice.sourceDistrictIds,
      choice.destinationDistrictIds,
      supportChanges
    );
  } else {
    midnightSession(state, seatId, choice.targetPartyId, choice.firmId);
  }

  return {
    choice,
    endsLobbyAction: choice.effect === "shell_firm",
    supportChanges
  };
}

function everyBeeCounts(
  state: UnboundState,
  partyId: PartyId,
  supportChanges: SupportChange[]
): void {
  const eligible = DISTRICT_IDS.filter(
    (districtId) =>
      (state.support[districtId][partyId] ?? 0) === 1 &&
      hasFreeSpot(state, districtId)
  );
  if (eligible.length === 0) {
    illegalBonus("Every Bee Counts requires at least one eligible district");
  }
  for (const districtId of eligible) {
    addSupport(state, districtId, partyId, supportChanges);
  }
}

function institutionalMemory(
  state: UnboundState,
  choice: Extract<UnboundBonusChoice, { effect: "institutional_memory" }>,
  supportChanges: SupportChange[]
): void {
  const policy = pendingPolicy(state, choice.regionId);
  const available = DISTRICT_IDS.filter(id => DISTRICTS_BY_ID[id].regionId === choice.regionId).reduce((n, id) => n + freeSpots(state, id), 0);
  const eligible = PARTY_IDS.filter(party => votesFor(party, policy) === choice.forPolicy);
  const required = Math.min(eligible.length, available);
  if (required === 0 || choice.placements.length !== required || new Set(choice.placements.map(p => p.partyId)).size !== required) illegalBonus("Institutional Memory must place one of each selected-side party while space permits");
  for (const placement of choice.placements) {
    if (!eligible.includes(placement.partyId) || DISTRICTS_BY_ID[placement.destinationDistrictId].regionId !== choice.regionId || !hasFreeSpot(state, placement.destinationDistrictId)) illegalBonus("Choose free spots in the policy region and different parties on the selected side");
    addSupport(state, placement.destinationDistrictId, placement.partyId, supportChanges);
  }
}

function pendingPolicy(state: UnboundState, regionId: RegionId) {
  const id = state.pendingPolicies[regionId];
  if (id === undefined) illegalBonus("This region has no pending policy");
  return POLICIES_BY_ID[id];
}
function freeSpots(state: UnboundState, id: DistrictId): number { return DISTRICTS_BY_ID[id].capacity - districtTotal(state, id); }
function adjacent(a: DistrictId, b: DistrictId): boolean { return (DISTRICTS_BY_ID[a].adjacentDistrictIds as readonly DistrictId[]).includes(b); }

function shellFirm(
  state: UnboundState,
  actingPartyId: PartyId,
  targetPartyId: PartyId
): void {
  const source = state.parties[actingPartyId];
  if (source?.status !== "open") {
    illegalBonus("Shell Firm requires an open acting party");
  }
  if (
    targetPartyId === actingPartyId ||
    state.parties[targetPartyId]?.status === "open"
  ) {
    illegalBonus("Shell Firm requires another party without a Firm marker");
  }

  const operations = source.operations;
  source.status = "closed";
  source.operations = emptyOperationInventory();
  state.parties[targetPartyId] = {
    partyId: targetPartyId,
    firmId: source.firmId,
    ownerSeatId: source.ownerSeatId,
    status: "open",
    operations
  };
}

function massTransit(
  state: UnboundState,
  choice: Extract<UnboundBonusChoice, { effect: "mass_transit" }>,
  supportChanges: SupportChange[]
): void {
  const { districtIds, supportPartyIds } = choice;
  if (
    districtIds.length < 2 ||
    districtIds.length > 5 ||
    new Set(districtIds).size !== districtIds.length ||
    supportPartyIds.length !== districtIds.length - 1
  ) {
    illegalBonus("Mass Transit requires a path of two to five different districts");
  }
  for (let index = 0; index < districtIds.length - 1; index += 1) {
    const sourceId = districtIds[index]!;
    const destinationId = districtIds[index + 1]!;
    const partyId = supportPartyIds[index]!;
    if (
      !(DISTRICTS_BY_ID[sourceId].adjacentDistrictIds as readonly DistrictId[]).includes(
        destinationId
      ) ||
      (state.support[sourceId][partyId] ?? 0) < 1
    ) {
      illegalBonus("Every Mass Transit step must follow the path and move existing Support");
    }
  }
  if (!hasFreeSpot(state, districtIds.at(-1)!)) {
    illegalBonus("Mass Transit requires a free spot at its final district");
  }

  for (let index = 0; index < supportPartyIds.length; index += 1) {
    moveSupport(
      state,
      districtIds[index]!,
      districtIds[index + 1]!,
      supportPartyIds[index]!,
      supportChanges
    );
  }
}

function emptyEveryNest(
  state: UnboundState,
  actingPartyId: PartyId,
  sourceDistrictIds: DistrictId[],
  destinationDistrictIds: DistrictId[],
  supportChanges: SupportChange[]
): void {
  const sources = DISTRICT_IDS.filter((id) => (state.support[id][actingPartyId] ?? 0) >= 2);
  const destinations = DISTRICT_IDS.filter((id) =>
    (state.support[id][actingPartyId] ?? 0) === 0 && hasFreeSpot(state, id)
  );
  const count = Math.min(sources.length, destinations.length);
  if (
    count === 0 ||
    sourceDistrictIds.length !== count ||
    destinationDistrictIds.length !== count ||
    new Set(sourceDistrictIds).size !== count ||
    new Set(destinationDistrictIds).size !== count ||
    sourceDistrictIds.some((id) => !sources.includes(id)) ||
    destinationDistrictIds.some((id) => !destinations.includes(id))
  ) {
    illegalBonus("Empty Every Nest must move the maximum possible number from different qualifying sources to different free districts where the party is absent");
  }
  for (let index = 0; index < count; index += 1) {
    moveSupport(state, sourceDistrictIds[index]!, destinationDistrictIds[index]!, actingPartyId, supportChanges);
  }
}

function midnightSession(
  state: UnboundState,
  seatId: SeatId,
  targetPartyId: PartyId,
  firmId: FirmId
): void {
  const target = state.parties[targetPartyId];
  const seat = state.seats.find((candidate) => candidate.id === seatId);
  const usedFirmIds = new Set(
    Object.values(state.parties).flatMap((party) =>
      party?.status === "open" ? [party.firmId] : []
    )
  );
  if (target?.status !== "closed") {
    illegalBonus("Midnight Session requires a closed party");
  }
  if (seat === undefined || !seat.firmIds.includes(firmId) || usedFirmIds.has(firmId)) {
    illegalBonus("Midnight Session requires one of the current player's returned Firm markers");
  }
  state.parties[targetPartyId] = {
    partyId: targetPartyId,
    firmId,
    ownerSeatId: seatId,
    status: "open",
    operations: emptyOperationInventory()
  };
}

function unboundBonusChoice(value: unknown): UnboundBonusChoice {
  const parsed = UnboundBonusChoiceSchema.safeParse(value);
  if (!parsed.success) invalidChoice(parsed.error.issues[0]?.message ?? "Invalid Bonus choice");
  function validateDistricts(input: unknown, key = ""): void {
    if (typeof input === "string" && (key.endsWith("DistrictId") || key === "districtId" || key.endsWith("DistrictIds") || key === "districtIds")) {
      if (!(DISTRICT_IDS as readonly string[]).includes(input)) invalidChoice("The choice must name a district");
    } else if (Array.isArray(input)) input.forEach(item => validateDistricts(item, key));
    else if (typeof input === "object" && input !== null) Object.entries(input).forEach(([name, item]) => validateDistricts(item, name));
  }
  validateDistricts(parsed.data);
  return parsed.data as UnboundBonusChoice;
}

function hasFreeSpot(state: UnboundState, districtId: DistrictId): boolean {
  return districtTotal(state, districtId) < DISTRICTS_BY_ID[districtId].capacity;
}

function districtTotal(state: UnboundState, districtId: DistrictId): number {
  return PARTY_IDS.reduce(
    (total, partyId) => total + (state.support[districtId][partyId] ?? 0),
    0
  );
}

function addSupport(
  state: UnboundState,
  districtId: DistrictId,
  partyId: PartyId,
  supportChanges: SupportChange[]
): void {
  const support = state.support[districtId];
  support[partyId] = (support[partyId] ?? 0) + 1;
  supportChanges.push({ type: "add", partyId, destinationDistrictId: districtId });
}

function moveSupport(
  state: UnboundState,
  sourceDistrictId: DistrictId,
  destinationDistrictId: DistrictId,
  partyId: PartyId,
  supportChanges: SupportChange[]
): void {
  const support = state.support[sourceDistrictId];
  const next = (support[partyId] ?? 0) - 1;
  if (next <= 0) {
    delete support[partyId];
  } else {
    support[partyId] = next;
  }
  const destination = state.support[destinationDistrictId];
  destination[partyId] = (destination[partyId] ?? 0) + 1;
  supportChanges.push({
    type: "move",
    partyId,
    sourceDistrictId,
    destinationDistrictId
  });
}

function emptyOperationInventory(): OperationInventory {
  return Object.fromEntries(OPERATION_IDS.map((operation) => [operation, 0])) as OperationInventory;
}

function invalidChoice(message: string): never {
  throw new GameRuleError("invalid_unbound_choice", message);
}

function illegalBonus(message: string): never {
  throw new GameRuleError("illegal_bonus", message);
}
