import { prisma } from "./prisma";
import type { PlayerCard } from "@prisma/client";

/**
 * Matchup generator
 * ------------------
 * Strategy (MVP):
 *   1. Pick a seed card — weighted toward higher OVR so matchups feel premium.
 *   2. Pick an opponent in the same position bucket (GK / DEF / MID / ATT) with OVR within a tight band.
 *   3. Fall back to any opponent in band if the bucket is sparse.
 *   4. Persist the Matchup row so votes can reference it.
 *
 * Recently-seen card IDs from the caller's session are avoided to reduce repetition.
 */

const BUCKETS: Record<string, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM"],
  ATT: ["ST", "CF", "LW", "RW"],
};

function bucketOf(position: string): keyof typeof BUCKETS {
  for (const [bucket, positions] of Object.entries(BUCKETS)) {
    if (positions.includes(position)) return bucket as keyof typeof BUCKETS;
  }
  return "MID";
}

/** Random int in [min,max] inclusive. */
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Pick a seed card. We bias selection to higher-rated players — more recognisable =
 * more engagement. ~60% of picks come from OVR >= 80 pool, ~40% from the long tail.
 */
async function pickSeedCard(excludeIds: number[]): Promise<PlayerCard | null> {
  const highPool = Math.random() < 0.6;
  const minOvr = highPool ? 80 : 60;

  const count = await prisma.playerCard.count({
    where: {
      overallRating: { gte: minOvr },
      id: excludeIds.length ? { notIn: excludeIds } : undefined,
    },
  });
  if (count === 0) {
    return prisma.playerCard.findFirst({
      where: { id: excludeIds.length ? { notIn: excludeIds } : undefined },
      orderBy: { id: "asc" },
    });
  }

  const skip = randInt(0, count - 1);
  return prisma.playerCard.findFirst({
    where: {
      overallRating: { gte: minOvr },
      id: excludeIds.length ? { notIn: excludeIds } : undefined,
    },
    skip,
  });
}

/** Find an opponent in the same position bucket and close OVR. Widens band if needed. */
async function pickOpponent(seed: PlayerCard, excludeIds: number[]): Promise<PlayerCard | null> {
  const bucket = bucketOf(seed.position);
  const positions = BUCKETS[bucket];

  for (const band of [3, 5, 8, 15]) {
    const count = await prisma.playerCard.count({
      where: {
        position: { in: positions },
        overallRating: { gte: seed.overallRating - band, lte: seed.overallRating + band },
        id: { notIn: [seed.id, ...excludeIds] },
      },
    });
    if (count === 0) continue;
    const skip = randInt(0, count - 1);
    const opp = await prisma.playerCard.findFirst({
      where: {
        position: { in: positions },
        overallRating: { gte: seed.overallRating - band, lte: seed.overallRating + band },
        id: { notIn: [seed.id, ...excludeIds] },
      },
      skip,
    });
    if (opp) return opp;
  }

  // Final fallback — any other card.
  const count = await prisma.playerCard.count({
    where: { id: { notIn: [seed.id, ...excludeIds] } },
  });
  if (count === 0) return null;
  return prisma.playerCard.findFirst({
    where: { id: { notIn: [seed.id, ...excludeIds] } },
    skip: randInt(0, count - 1),
  });
}

export interface GeneratedMatchup {
  id: string;
  category: string;
  left: PlayerCard;
  right: PlayerCard;
}

/**
 * Generate and persist a fresh matchup, avoiding recently-seen card IDs.
 * Returns null only if the DB has fewer than 2 cards.
 */
export async function generateMatchup(
  recentCardIds: number[] = [],
): Promise<GeneratedMatchup | null> {
  const seed = await pickSeedCard(recentCardIds);
  if (!seed) return null;

  const opp = await pickOpponent(seed, recentCardIds);
  if (!opp) return null;

  // 50/50 which side is "left" so UI isn't biased.
  const [left, right] = Math.random() < 0.5 ? [seed, opp] : [opp, seed];

  const matchup = await prisma.matchup.create({
    data: {
      leftCardId: left.id,
      rightCardId: right.id,
      category: bucketOf(seed.position).toLowerCase(),
    },
  });

  return { id: matchup.id, category: matchup.category, left, right };
}

/** Aggregate the vote split for a specific matchup. */
export async function getMatchupResult(matchupId: string) {
  const votes = await prisma.vote.groupBy({
    by: ["chosenCardId"],
    where: { matchupId },
    _count: { _all: true },
  });
  const total = votes.reduce((s, v) => s + v._count._all, 0);
  const pct = (id: number) => {
    const row = votes.find((v) => v.chosenCardId === id);
    if (!row || total === 0) return 0;
    return Math.round((row._count._all / total) * 100);
  };
  return { total, pct };
}
