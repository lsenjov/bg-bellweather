import { DISTRICTS, REGION_IDS, POLICIES_BY_ID, activeLawEffects, votesFor, type RegionId, type PolicyId, type ScoringCard } from "@bellwether/content";
import type { DistrictState, Party } from "./operations.js";
import type { ElectionRecord } from "./model.js";

export interface ElectionPlayer { id: string; position: number; points: number; card: ScoringCard; finalCardCount: number; }
export interface RecordedDistrictDraw { districtId: string; parties: Party[]; }
export type ElectionScore = ElectionRecord["scores"][number];
export interface ElectionResult { draws: Record<string, RecordedDistrictDraw>; scores: ElectionScore[]; policyVotes: ElectionRecord["policyVotes"]; winnerIds: string[]; }
export function recordElectionDraws(
  districts: Readonly<Record<string, DistrictState>>,
  random: () => number
): Record<string, RecordedDistrictDraw> {
  const draws: Record<string, RecordedDistrictDraw> = {};

  for (const [districtId, district] of Object.entries(districts)) {
    if (districtId === "bellwether-centre") {
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
  state: { districts: Record<string, DistrictState> };
  pendingPolicies: Partial<Record<RegionId, PolicyId>>;
  enactedPolicyIds: readonly PolicyId[];
  players: readonly ElectionPlayer[];
  random: () => number;
  finalElection: boolean;
}): ElectionResult {
  const draws = recordElectionDraws(input.state.districts, input.random);
  const support = retainElectionSupport(input.state.districts, draws);
  const policyVotes = REGION_IDS.map(regionId => {
    const policyId = input.pendingPolicies[regionId];
    if (policyId === undefined) throw new Error(`Missing policy for ${regionId}`);
    const policy = POLICIES_BY_ID[policyId];
    let forVotes = 0, againstVotes = 0;
    for (const district of DISTRICTS.filter(d => d.regionId === regionId)) {
      for (const [party, count] of Object.entries(support[district.id]!)) {
        if (votesFor(party as Party, policy)) forVotes += count ?? 0;
        else againstVotes += count ?? 0;
      }
    }
    return { regionId, policyId, forVotes, againstVotes, passed: forVotes > againstVotes };
  });
  const enacted = [...input.enactedPolicyIds, ...policyVotes.filter(v => v.passed).map(v => v.policyId)];
  const bonuses = finalCardRankBonuses(input.players);
  const scores = input.players.map(player => {
    const policyScores = input.finalElection ? scorePolicies(player.card, enacted) : [];
    const policyScore = policyScores.reduce((total, score) => total + score.net, 0);
    const finalCardRankBonus = input.finalElection ? bonuses.get(player.id)! : 0;
    const pointsChange = policyScore + finalCardRankBonus;
    return { playerId: player.id, policyScore, policyScores, finalCardCount: input.finalElection ? player.finalCardCount : null, finalCardRankBonus, pointsChange, resultingPoints: player.points + pointsChange };
  });
  return { draws, policyVotes, scores, winnerIds: input.finalElection ? determineWinners(scores.map(s => ({id: s.playerId, points: s.resultingPoints}))) : [] };
}

export function scorePolicies(card: ScoringCard, policyIds: readonly PolicyId[], enactedPolicyIds: readonly PolicyId[] = policyIds): ElectionScore["policyScores"] {
  const effects = activeLawEffects(enactedPolicyIds);
  const value = (category: ScoringCard["order"][number]) => {
    const printed = 6 - card.order.indexOf(category);
    return printed === 6 && effects.includes(19) ? 4 : printed === 1 && effects.includes(20) ? 3 : printed;
  };
  return policyIds.map(policyId => {
    const policy = POLICIES_BY_ID[policyId];
    const gain = value(policy.plus), loss = value(policy.minus);
    return { policyId, gain, loss, net: gain - loss };
  });
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
