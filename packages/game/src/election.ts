import type { DistrictState, OperationState, Party } from "./operations.js";
import type {
  ScoringCard as ContentScoringCard,
  SeatReference
} from "@bellweather/content";

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
  cards: ScoringCard[];
  capitalCard: ScoringCard;
  finalCardCount: number;
}

export interface RecordedDistrictDraw {
  districtId: string;
  parties: Party[];
}

export interface ElectionScore {
  playerId: string;
  baseDistrictScore: number;
  seatModifier: number;
  capitalMatches: number;
  capitalScore: number;
  finalCardCount: number | null;
  finalCardRankBonus: number;
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
  random: () => number
): Record<string, RecordedDistrictDraw> {
  const draws: Record<string, RecordedDistrictDraw> = {};

  for (const [districtId, district] of Object.entries(districts)) {
    if (districtId === "bellweather-centre") {
      continue;
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

export function retainElectionSupport(
  districts: Readonly<Record<string, DistrictState>>,
  draws: Readonly<Record<string, RecordedDistrictDraw>>
): Record<string, Partial<Record<Party, number>>> {
  const retained = Object.fromEntries(
    Object.entries(districts).map(([districtId, district]) => [
      districtId,
      { ...district.support }
    ])
  ) as Record<string, Partial<Record<Party, number>>>;

  for (const draw of Object.values(draws)) {
    if (districts[draw.districtId] === undefined) {
      throw new Error(`Unknown retained election district: ${draw.districtId}`);
    }
    const support: Partial<Record<Party, number>> = {};
    for (const party of draw.parties) {
      support[party] = (support[party] ?? 0) + 1;
    }
    retained[draw.districtId] = support;
  }

  return retained;
}

export function scoreElectionDay(input: {
  state: Pick<OperationState, "districts" | "coalitionTargets">;
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
    input.random
  );
  const baseScores = new Map(
    players.map((player) => [
      player.id,
      player.cards.reduce(
        (score, card) =>
          score + scoreCard(card, draws, input.state.coalitionTargets),
        0
      )
    ])
  );
  const finalCardBonuses = input.finalElection
    ? finalCardRankBonuses(players)
    : new Map<string, number>();
  const scores = players.map((player, seatIndex): ElectionScore => {
    const baseDistrictScore = baseScores.get(player.id)!;
    const seatModifier =
      players.length < 4
        ? 0
        : referencedScore(
            players,
            seatIndex,
            singleScoringCard(player).positiveSeat,
            baseScores
          ) -
          referencedScore(
            players,
            seatIndex,
            singleScoringCard(player).negativeSeat,
            baseScores
          );
    const { matches: capitalMatches, score: capitalScore } = scoreCapital(
      player.capitalCard,
      input.state.districts["bellweather-centre"]
    );
    const finalCardRankBonus = finalCardBonuses.get(player.id) ?? 0;
    const pointsChange =
      baseDistrictScore + seatModifier + capitalScore + finalCardRankBonus;
    return {
      playerId: player.id,
      baseDistrictScore,
      seatModifier,
      capitalMatches,
      capitalScore,
      finalCardCount: input.finalElection ? player.finalCardCount : null,
      finalCardRankBonus,
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

export function finalCardRankBonuses(
  players: readonly Pick<ElectionPlayer, "id" | "finalCardCount">[]
): Map<string, number> {
  if (players.some(
    (player) => !Number.isSafeInteger(player.finalCardCount) || player.finalCardCount < 0
  )) {
    throw new Error("Final card counts must be non-negative integers");
  }
  return new Map(players.map((player) => [
    player.id,
    players.filter(
      (candidate) => candidate.finalCardCount <= player.finalCardCount
    ).length - 1
  ]));
}

export function scoreCapital(
  card: ScoringCard,
  capital: DistrictState | undefined
): { matches: number; score: number } {
  if (capital === undefined) {
    throw new Error("Bellweather Centre is required for Capital scoring");
  }
  const parties = new Set(card.objectives.map((objective) => objective.party));
  const matches = [...parties].filter(
    (party) => (capital.support[party] ?? 0) > 0
  ).length;
  return {
    matches,
    score: matches === 3 ? 3 : matches === 2 ? 1 : 0
  };
}

function singleScoringCard(player: ElectionPlayer): ScoringCard {
  if (player.cards.length !== 1) {
    throw new Error("Four-to-six-player elections require one scoring card per player");
  }
  return player.cards[0]!;
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
  coalitionTargets: Readonly<Record<Party, Party | null>>
): number {
  return card.objectives.reduce((score, objective) => {
    const draw = draws[objective.districtId];
    if (draw === undefined) {
      throw new Error(`Missing recorded draw for ${objective.districtId}`);
    }
    const matchingParties = new Set<Party>([objective.party]);
    const target = coalitionTargets[objective.party];
    if (target !== null && coalitionTargets[target] === objective.party) {
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
  throw new Error(`Election districts cannot use capacity ${capacity}`);
}
