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
import type { GameState, OperationInventory, SeatId } from "./model.js";
import { GameRuleError } from "./model.js";

export type UnboundBonusChoice =
  | { effect: "every_bee_counts" }
  | {
      effect: "institutional_memory";
      scoringCardId: ScoringCardId;
      moves: Array<{ objectiveIndex: 0 | 1 | 2; sourceDistrictId: DistrictId }>;
    }
  | { effect: "shell_firm"; targetPartyId: PartyId }
  | {
      effect: "mass_transit";
      districtIds: DistrictId[];
      supportPartyIds: PartyId[];
    }
  | { effect: "empty_every_nest"; destinationDistrictIds: DistrictId[] }
  | { effect: "midnight_session"; targetPartyId: PartyId; firmId: FirmId };

export interface UnboundBonusResolution {
  choice: UnboundBonusChoice;
  endsLobbyAction: boolean;
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
  if (UNBOUND_EFFECTS[bonusCardId as keyof typeof UNBOUND_EFFECTS] !== choice.effect) {
    throw new GameRuleError(
      "unbound_choice_mismatch",
      "The choice must match the Unbound Bonus card"
    );
  }

  if (choice.effect === "every_bee_counts") {
    everyBeeCounts(state, actingPartyId);
  } else if (choice.effect === "institutional_memory") {
    institutionalMemory(state, choice);
  } else if (choice.effect === "shell_firm") {
    shellFirm(state, actingPartyId, choice.targetPartyId);
  } else if (choice.effect === "mass_transit") {
    massTransit(state, choice);
  } else if (choice.effect === "empty_every_nest") {
    emptyEveryNest(state, actingPartyId, choice.destinationDistrictIds);
  } else {
    midnightSession(state, seatId, choice.targetPartyId, choice.firmId);
  }

  return {
    choice,
    endsLobbyAction: choice.effect === "shell_firm"
  };
}

function everyBeeCounts(state: GameState, partyId: PartyId): void {
  const eligible = DISTRICT_IDS.filter(
    (districtId) =>
      (state.support[districtId][partyId] ?? 0) === 1 &&
      hasFreeSpot(state, districtId)
  );
  if (eligible.length === 0) {
    illegalBonus("Every Bee Counts requires at least one eligible district");
  }
  for (const districtId of eligible) {
    addSupport(state, districtId, partyId);
  }
}

function institutionalMemory(
  state: GameState,
  choice: Extract<UnboundBonusChoice, { effect: "institutional_memory" }>
): void {
  const revealed = new Set(
    state.electionHistory.flatMap((election) =>
      election.scoringCards.flatMap((cards) => cards.scoringCardIds)
    )
  );
  if (!revealed.has(choice.scoringCardId)) {
    illegalBonus("Institutional Memory requires a revealed scoring card");
  }
  if (choice.moves.length === 0) {
    illegalBonus("Institutional Memory must complete at least one objective");
  }
  if (new Set(choice.moves.map((move) => move.objectiveIndex)).size !== choice.moves.length) {
    illegalBonus("Institutional Memory cannot choose an objective more than once");
  }

  const scoringCard = SCORING_CARDS_BY_ID[choice.scoringCardId];
  for (const move of choice.moves) {
    const objective = scoringCard.objectives[move.objectiveIndex];
    if (
      move.sourceDistrictId === objective.districtId ||
      (state.support[move.sourceDistrictId][objective.partyId] ?? 0) < 1 ||
      !hasFreeSpot(state, objective.districtId)
    ) {
      illegalBonus("Every chosen Institutional Memory objective must be legal");
    }
  }
  for (const move of choice.moves) {
    const objective = scoringCard.objectives[move.objectiveIndex];
    removeSupport(state, move.sourceDistrictId, objective.partyId);
    addSupport(state, objective.districtId, objective.partyId);
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
  choice: Extract<UnboundBonusChoice, { effect: "mass_transit" }>
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
    removeSupport(state, districtIds[index]!, supportPartyIds[index]!);
  }
  for (let index = 0; index < supportPartyIds.length; index += 1) {
    addSupport(state, districtIds[index + 1]!, supportPartyIds[index]!);
  }
}

function emptyEveryNest(
  state: GameState,
  actingPartyId: PartyId,
  destinationDistrictIds: DistrictId[]
): void {
  const sources = DISTRICT_IDS.filter(
    (districtId) => (state.support[districtId][actingPartyId] ?? 0) >= 2
  );
  if (
    sources.length === 0 ||
    destinationDistrictIds.length !== sources.length ||
    new Set(destinationDistrictIds).size !== destinationDistrictIds.length ||
    destinationDistrictIds.some(
      (districtId) =>
        (state.support[districtId][actingPartyId] ?? 0) !== 0 ||
        !hasFreeSpot(state, districtId)
    )
  ) {
    illegalBonus(
      "Empty Every Nest requires one different eligible destination for every qualifying district"
    );
  }
  for (const districtId of sources) {
    removeSupport(state, districtId, actingPartyId);
  }
  for (const districtId of destinationDistrictIds) {
    addSupport(state, districtId, actingPartyId);
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
    if (!Array.isArray(choice.moves)) invalidChoice("moves must be an array");
    const moves = choice.moves.map((move) => {
      if (typeof move !== "object" || move === null) invalidChoice("moves must be objects");
      const fields = move as Record<string, unknown>;
      if (![0, 1, 2].includes(fields.objectiveIndex as number)) {
        invalidChoice("objectiveIndex must be 0, 1, or 2");
      }
      requireDistrictId(fields.sourceDistrictId);
      return {
        objectiveIndex: fields.objectiveIndex as 0 | 1 | 2,
        sourceDistrictId: fields.sourceDistrictId
      };
    });
    return { effect: choice.effect, scoringCardId: choice.scoringCardId, moves };
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

function addSupport(state: GameState, districtId: DistrictId, partyId: PartyId): void {
  const support = state.support[districtId];
  support[partyId] = (support[partyId] ?? 0) + 1;
}

function removeSupport(state: GameState, districtId: DistrictId, partyId: PartyId): void {
  const support = state.support[districtId];
  const next = (support[partyId] ?? 0) - 1;
  if (next <= 0) {
    delete support[partyId];
  } else {
    support[partyId] = next;
  }
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
