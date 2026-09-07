import {
  DISTRICTS_BY_ID,
  DISTRICT_IDS,
  FIRM_IDS,
  OPERATION_IDS,
  PARTY_IDS,
  SCORING_CARD_IDS,
  SCORING_CARDS_BY_ID,
  type BonusCardId,
  type DistrictId,
  type FirmId,
  type PartyId,
  type ScoringCardId
} from "@bellweather/content";
import type {
  GameState,
  OperationInventory,
  SeatId,
  SupportChange
} from "./model.js";
import { GameRuleError } from "./model.js";

export type UnboundBonusChoice =
  | { effect: "every_bee_counts" }
  | {
      effect: "institutional_memory";
      scoringCardId: ScoringCardId;
      placements: Array<{ objectiveIndex: 0 | 1 | 2; destinationDistrictId: DistrictId }>;
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
  "honeycomb-every-bee-counts": "every_bee_counts",
  "old-shell-institutional-memory": "institutional_memory",
  "foxglove-shell-firm": "shell_firm",
  "riverworks-mass-transit": "mass_transit",
  "many-wings-empty-every-nest": "empty_every_nest",
  "night-parliament-midnight-session": "midnight_session"
} as const satisfies Partial<Record<BonusCardId, UnboundBonusChoice["effect"]>>;

export function resolveUnboundBonus(
  state: GameState,
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
  state: GameState,
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
  state: GameState,
  choice: Extract<UnboundBonusChoice, { effect: "institutional_memory" }>,
  supportChanges: SupportChange[]
): void {
  const revealed = new Set(
    state.electionHistory.flatMap((election) =>
      election.scoringCards.flatMap((cards) => cards.scoringCardIds)
    )
  );
  if (!revealed.has(choice.scoringCardId)) {
    illegalBonus("Institutional Memory requires a revealed scoring card");
  }
  const scoringCard = SCORING_CARDS_BY_ID[choice.scoringCardId];
  const required = scoringCard.objectives.flatMap((objective, index) =>
    DISTRICT_IDS.some((id) => DISTRICTS_BY_ID[id].regionId === objective.regionId && hasFreeSpot(state, id))
      ? [index] : []
  );
  if (
    required.length === 0 ||
    choice.placements.length !== required.length ||
    new Set(choice.placements.map((placement) => placement.objectiveIndex)).size !== required.length ||
    choice.placements.some((placement) => !required.includes(placement.objectiveIndex))
  ) {
    illegalBonus("Institutional Memory must add Support for every objective with regional space, at least once");
  }
  for (const placement of choice.placements) {
    const objective = scoringCard.objectives[placement.objectiveIndex];
    if (
      DISTRICTS_BY_ID[placement.destinationDistrictId].regionId !== objective.regionId ||
      !hasFreeSpot(state, placement.destinationDistrictId)
    ) {
      illegalBonus("Every Institutional Memory destination must have a free spot in its objective's region");
    }
  }
  for (const placement of choice.placements) {
    addSupport(state, placement.destinationDistrictId, scoringCard.objectives[placement.objectiveIndex].partyId, supportChanges);
  }
}

function shellFirm(
  state: GameState,
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
  state: GameState,
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
  state: GameState,
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
  state: GameState,
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
  if (typeof value !== "object" || value === null || !("effect" in value)) {
    invalidChoice("An Unbound Bonus choice is required");
  }
  const choice = value as Record<string, unknown>;
  if (choice.effect === "every_bee_counts") {
    return { effect: choice.effect };
  }
  if (choice.effect === "institutional_memory") {
    requireScoringCardId(choice.scoringCardId);
    if (!Array.isArray(choice.placements)) invalidChoice("placements must be an array");
    const placements = choice.placements.map((move) => {
      if (typeof move !== "object" || move === null) invalidChoice("placements must be objects");
      const fields = move as Record<string, unknown>;
      if (![0, 1, 2].includes(fields.objectiveIndex as number)) {
        invalidChoice("objectiveIndex must be 0, 1, or 2");
      }
      requireDistrictId(fields.destinationDistrictId);
      return {
        objectiveIndex: fields.objectiveIndex as 0 | 1 | 2,
        destinationDistrictId: fields.destinationDistrictId
      };
    });
    return { effect: choice.effect, scoringCardId: choice.scoringCardId, placements };
  }
  if (choice.effect === "shell_firm") {
    requirePartyId(choice.targetPartyId);
    return { effect: choice.effect, targetPartyId: choice.targetPartyId };
  }
  if (choice.effect === "mass_transit") {
    return {
      effect: choice.effect,
      districtIds: districtIdArray(choice.districtIds, "districtIds"),
      supportPartyIds: partyIdArray(choice.supportPartyIds, "supportPartyIds")
    };
  }
  if (choice.effect === "empty_every_nest") {
    return {
      effect: choice.effect,
      sourceDistrictIds: districtIdArray(choice.sourceDistrictIds, "sourceDistrictIds"),
      destinationDistrictIds: districtIdArray(
        choice.destinationDistrictIds,
        "destinationDistrictIds"
      )
    };
  }
  if (choice.effect === "midnight_session") {
    requirePartyId(choice.targetPartyId);
    requireFirmId(choice.firmId);
    return {
      effect: choice.effect,
      targetPartyId: choice.targetPartyId,
      firmId: choice.firmId
    };
  }
  invalidChoice("The Unbound Bonus choice has an unknown effect");
}

function districtIdArray(value: unknown, field: string): DistrictId[] {
  if (!Array.isArray(value)) invalidChoice(`${field} must be an array`);
  for (const districtId of value) requireDistrictId(districtId);
  return value;
}

function partyIdArray(value: unknown, field: string): PartyId[] {
  if (!Array.isArray(value)) invalidChoice(`${field} must be an array`);
  for (const partyId of value) requirePartyId(partyId);
  return value;
}

function requireDistrictId(value: unknown): asserts value is DistrictId {
  if (!(DISTRICT_IDS as readonly unknown[]).includes(value)) {
    invalidChoice("The choice must name a district");
  }
}

function requirePartyId(value: unknown): asserts value is PartyId {
  if (!(PARTY_IDS as readonly unknown[]).includes(value)) {
    invalidChoice("The choice must name a party");
  }
}

function requireFirmId(value: unknown): asserts value is FirmId {
  if (!(FIRM_IDS as readonly unknown[]).includes(value)) {
    invalidChoice("The choice must name a Firm marker");
  }
}

function requireScoringCardId(value: unknown): asserts value is ScoringCardId {
  if (!(SCORING_CARD_IDS as readonly unknown[]).includes(value)) {
    invalidChoice("The choice must name a scoring card");
  }
}

function hasFreeSpot(state: GameState, districtId: DistrictId): boolean {
  return districtTotal(state, districtId) < DISTRICTS_BY_ID[districtId].capacity;
}

function districtTotal(state: GameState, districtId: DistrictId): number {
  return PARTY_IDS.reduce(
    (total, partyId) => total + (state.support[districtId][partyId] ?? 0),
    0
  );
}

function addSupport(
  state: GameState,
  districtId: DistrictId,
  partyId: PartyId,
  supportChanges: SupportChange[]
): void {
  const support = state.support[districtId];
  support[partyId] = (support[partyId] ?? 0) + 1;
  supportChanges.push({ type: "add", partyId, destinationDistrictId: districtId });
}

function moveSupport(
  state: GameState,
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
