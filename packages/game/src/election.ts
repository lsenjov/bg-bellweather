import type { DistrictState, OperationState, Party } from "./operations.js";
import type {
  ScoringCard as ContentScoringCard,
  SeatReference
} from "@bellwether/content";

export type RelativeSeat =
  | "left"
  | "right"
  | "second-left"
  | "second-right";

export interface ElectionObjective {
  districtId: string;
  party: Party;
}

export interface ScoringCard {
  id: string;
  objectives: readonly ElectionObjective[];
  positiveSeat?: RelativeSeat;
  negativeSeat?: RelativeSeat;
}

export interface ElectionPlayer {
  id: string;
  position: number;
  points: number;
  card: ScoringCard;
}

export interface RecordedDistrictDraw {
  districtId: string;
  parties: Party[];
}

export interface ElectionScore {
  playerId: string;
  baseDistrictScore: number;
  seatModifier: number;
  pointsChange: number;
  resultingPoints: number;
}

export interface ElectionResult {
  draws: Record<string, RecordedDistrictDraw>;
  scores: ElectionScore[];
  players: ElectionPlayer[];
  winnerIds: string[];
}

export function recordElectionDraws(
  districts: Readonly<Record<string, DistrictState>>,
  cards: readonly ScoringCard[],
  random: () => number
): Record<string, RecordedDistrictDraw> {
  const namedDistricts = new Set(
    cards.flatMap((card) =>
      card.objectives.map((objective) => objective.districtId)
    )
  );
  const draws: Record<string, RecordedDistrictDraw> = {};

  for (const districtId of namedDistricts) {
    const district = districts[districtId];
    if (district === undefined) {
      throw new Error(`Unknown election district: ${districtId}`);
    }
    const pool = Object.entries(district.support).flatMap(([party, count]) =>
      Array.from({ length: count ?? 0 }, () => party as Party)
    );
    const parties: Party[] = [];
    const count = Math.min(drawCount(district.capacity), pool.length);
    for (let index = 0; index < count; index += 1) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new Error("Election random values must be in [0, 1)");
      }
      const selected = Math.floor(value * pool.length);
      parties.push(pool.splice(selected, 1)[0]!);
    }
    draws[districtId] = { districtId, parties };
  }

  return draws;
}

export function scoreElectionDay(input: {
  state: Pick<OperationState, "districts" | "overtures">;
  players: readonly ElectionPlayer[];
  random: () => number;
  finalElection: boolean;
}): ElectionResult {
  if (input.players.length < 2 || input.players.length > 6) {
    throw new Error("Election Day requires two to six players");
  }
  const players = [...input.players].sort(
    (left, right) => left.position - right.position
  );
  if (
    players.some((player, index) => player.position !== index)
  ) {
    throw new Error("Election players require unique contiguous seat positions");
  }
  const draws = recordElectionDraws(
    input.state.districts,
    players.map((player) => player.card),
    input.random
  );
  const baseScores = new Map(
    players.map((player) => [
      player.id,
      scoreCard(player.card, draws, input.state.overtures)
    ])
  );
  const scores = players.map((player, seatIndex): ElectionScore => {
    const baseDistrictScore = baseScores.get(player.id)!;
    const seatModifier =
      players.length < 4
        ? 0
        : referencedScore(
            players,
            seatIndex,
            player.card.positiveSeat,
            baseScores
          ) -
          referencedScore(
            players,
            seatIndex,
            player.card.negativeSeat,
            baseScores
          );
    const pointsChange = baseDistrictScore + seatModifier;
    return {
      playerId: player.id,
      baseDistrictScore,
      seatModifier,
      pointsChange,
      resultingPoints: player.points + pointsChange
    };
  });
  const scoredPlayers = players.map((player) => ({
    ...player,
    points: scores.find((score) => score.playerId === player.id)!.resultingPoints
  }));

  return {
    draws,
    scores,
    players: scoredPlayers,
    winnerIds: input.finalElection ? determineWinners(scoredPlayers) : []
  };
}

export function toElectionScoringCard(card: ContentScoringCard): ScoringCard {
  return {
    id: card.id,
    objectives: card.objectives.map((objective) => ({
      districtId: objective.districtId,
      party: objective.partyId
    })),
    positiveSeat: card.gain as SeatReference,
    negativeSeat: card.lose as SeatReference
  };
}

export function scoreCard(
  card: ScoringCard,
  draws: Readonly<Record<string, RecordedDistrictDraw>>,
  overtures: Readonly<Record<Party, Party | null>>
): number {
  return card.objectives.reduce((score, objective) => {
    const draw = draws[objective.districtId];
    if (draw === undefined) {
      throw new Error(`Missing recorded draw for ${objective.districtId}`);
    }
    const matchingParties = new Set<Party>([objective.party]);
    const target = overtures[objective.party];
    if (target !== null && overtures[target] === objective.party) {
      matchingParties.add(target);
    }
    return (
      score +
      draw.parties.filter((party) => matchingParties.has(party)).length
    );
  }, 0);
}

export function determineWinners(
  players: readonly Pick<ElectionPlayer, "id" | "points">[]
): string[] {
  if (players.length === 0) {
    return [];
  }
  const highest = Math.max(...players.map((player) => player.points));
  return players
    .filter((player) => player.points === highest)
    .map((player) => player.id);
}

export function relativeSeatIndex(
  seatIndex: number,
  playerCount: number,
  relativeSeat: RelativeSeat
): number {
  if (
    !Number.isInteger(seatIndex) ||
    !Number.isInteger(playerCount) ||
    playerCount < 2 ||
    seatIndex < 0 ||
    seatIndex >= playerCount
  ) {
    throw new Error("Invalid player seating");
  }
  const offset =
    relativeSeat === "left"
      ? -1
      : relativeSeat === "right"
        ? 1
        : relativeSeat === "second-left"
          ? -2
          : 2;
  return (seatIndex + offset + playerCount) % playerCount;
}

function referencedScore(
  players: readonly ElectionPlayer[],
  seatIndex: number,
  reference: RelativeSeat | undefined,
  baseScores: ReadonlyMap<string, number>
): number {
  if (reference === undefined) {
    throw new Error(
      "Four-to-six-player scoring cards require both seat references"
    );
  }
  const player = players[relativeSeatIndex(seatIndex, players.length, reference)]!;
  return baseScores.get(player.id)!;
}

function drawCount(capacity: number): number {
  if (capacity === 6) {
    return 3;
  }
  if (capacity === 4) {
    return 2;
  }
  if (capacity === 2) {
    return 1;
  }
  throw new Error(`Election objectives cannot use capacity ${capacity}`);
}
