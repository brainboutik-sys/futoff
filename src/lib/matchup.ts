import { prisma } from "./prisma";
import type { PlayerCard } from "@prisma/client";

/**
 * Matchup generator — 6 product modes.
 *
 *   rivalry     — two top players from clubs listed in the Rivalry table
 *   same-level  — same position bucket, OVR within 1 (friction = engagement)
 *   goat        — one icon/legend vs one current high-rated player (generational war)
 *   meta        — "meta" tagged stat freak vs "real-football" balanced high-OVR
 *   club        — two top players from the SAME big club (internal debate)
 *   wildcard    — orthogonal stat axes (pace vs skill, strength vs playmaker, etc.)
 *
 * Plus:
 *   featured    — hand-curated Matchup rows (Messi vs Ronaldo, etc.), always pulled first if available
 *   random      — legacy fallback: position-bucketed, OVR-banded
 *
 * Matchup rows are persisted so votes can reference them and so "rematch controversial"
 * can re-surface close ones later.
 */

export type Mode =
  | "rivalry"
  | "same-level"
  | "goat"
  | "meta"
  | "club"
  | "wildcard"
  | "featured"
  | "random";

const BUCKETS: Record<"GK" | "DEF" | "MID" | "ATT", string[]> = {
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

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Random top player from a club, optionally excluding some IDs. */
async function topPlayerFromClub(club: string, excludeIds: number[] = []): Promise<PlayerCard | null> {
  const top = await prisma.playerCard.findMany({
    where: { club, id: excludeIds.length ? { notIn: excludeIds } : undefined },
    orderBy: { overallRating: "desc" },
    take: 5,
  });
  if (top.length === 0) return null;
  return top[randInt(0, top.length - 1)];
}

async function withTag(
  tag: string,
  opts: { excludeIds?: number[]; minOvr?: number; not?: string } = {},
): Promise<PlayerCard | null> {
  const rows = await prisma.playerCard.findMany({
    where: {
      tags: { contains: `"${tag}"` },
      overallRating: { gte: opts.minOvr ?? 75 },
      id: opts.excludeIds?.length ? { notIn: opts.excludeIds } : undefined,
      ...(opts.not ? { NOT: { tags: { contains: `"${opts.not}"` } } } : {}),
    },
    orderBy: { overallRating: "desc" },
    take: 80,
  });
  if (rows.length === 0) return null;
  return rows[randInt(0, rows.length - 1)];
}

async function highOvrCard(
  opts: { excludeIds?: number[]; minOvr?: number } = {},
): Promise<PlayerCard | null> {
  const minOvr = opts.minOvr ?? 80;
  const count = await prisma.playerCard.count({
    where: {
      overallRating: { gte: minOvr },
      id: opts.excludeIds?.length ? { notIn: opts.excludeIds } : undefined,
    },
  });
  if (count === 0) return null;
  return prisma.playerCard.findFirst({
    where: {
      overallRating: { gte: minOvr },
      id: opts.excludeIds?.length ? { notIn: opts.excludeIds } : undefined,
    },
    skip: randInt(0, count - 1),
  });
}

// --- Mode generators --------------------------------------------------------

async function buildRivalry(excludeIds: number[]): Promise<{ pair: [PlayerCard, PlayerCard]; label: string } | null> {
  const rivalries = await prisma.rivalry.findMany({ orderBy: { priority: "desc" } });
  if (rivalries.length === 0) return null;
  // Try a few in random order until one produces two valid cards.
  const order = [...rivalries].sort(() => Math.random() - 0.5);
  for (const r of order) {
    const a = await topPlayerFromClub(r.clubA, excludeIds);
    const b = await topPlayerFromClub(r.clubB, excludeIds);
    if (a && b) return { pair: [a, b], label: r.label ?? `${r.clubA} vs ${r.clubB}` };
  }
  return null;
}

async function buildSameLevel(excludeIds: number[]): Promise<[PlayerCard, PlayerCard] | null> {
  const seed = await highOvrCard({ excludeIds, minOvr: 82 });
  if (!seed) return null;
  const opp = await prisma.playerCard.findFirst({
    where: {
      position: { in: BUCKETS[bucketOf(seed.position)] },
      overallRating: { gte: seed.overallRating - 1, lte: seed.overallRating + 1 },
      id: { notIn: [seed.id, ...excludeIds] },
    },
    skip: randInt(0, 20),
  });
  return opp ? [seed, opp] : null;
}

async function buildGoat(excludeIds: number[]): Promise<{ pair: [PlayerCard, PlayerCard]; label: string } | null> {
  const icon = await prisma.playerCard.findFirst({
    where: { cardType: "icon", id: excludeIds.length ? { notIn: excludeIds } : undefined },
    skip: randInt(0, 20),
  });
  if (!icon) return null;
  const current = await prisma.playerCard.findFirst({
    where: {
      cardType: { not: "icon" },
      overallRating: { gte: 88 },
      id: { notIn: [icon.id, ...excludeIds] },
      ...(icon.position ? { position: { in: BUCKETS[bucketOf(icon.position)] } } : {}),
    },
    skip: randInt(0, 20),
  });
  return current ? { pair: [icon, current], label: "Generational War" } : null;
}

async function buildMeta(excludeIds: number[]): Promise<{ pair: [PlayerCard, PlayerCard]; label: string } | null> {
  const metaTags = ["pace_monster", "skill_merchant", "tank", "finisher"];
  const metaTag = metaTags[randInt(0, metaTags.length - 1)];
  const metaCard = await withTag(metaTag, { excludeIds, minOvr: 82 });
  if (!metaCard) return null;
  const realCard = await prisma.playerCard.findFirst({
    where: {
      overallRating: { gte: metaCard.overallRating - 3, lte: metaCard.overallRating + 3 },
      id: { notIn: [metaCard.id, ...excludeIds] },
      NOT: { tags: { contains: `"${metaTag}"` } },
    },
    skip: randInt(0, 30),
  });
  if (!realCard) return null;
  const label = {
    pace_monster: "Pace vs Technique",
    skill_merchant: "Flair vs Function",
    tank: "Strength vs Intelligence",
    finisher: "Finishing vs Build-up",
  }[metaTag];
  return { pair: [metaCard, realCard], label: label ?? "Meta vs Real" };
}

async function buildClub(excludeIds: number[]): Promise<{ pair: [PlayerCard, PlayerCard]; label: string } | null> {
  // Pick a big club at random from cards that have 3+ high-rated players.
  const bigClubs = await prisma.$queryRawUnsafe<{ club: string; n: bigint }[]>(`
    SELECT "club", COUNT(*)::bigint AS n FROM "PlayerCard"
    WHERE "club" IS NOT NULL AND "overallRating" >= 82
    GROUP BY "club" HAVING COUNT(*) >= 3 LIMIT 80
  `);
  if (bigClubs.length === 0) return null;
  const club = bigClubs[randInt(0, bigClubs.length - 1)].club;
  const rows = await prisma.playerCard.findMany({
    where: { club, overallRating: { gte: 80 }, id: excludeIds.length ? { notIn: excludeIds } : undefined },
    orderBy: { overallRating: "desc" },
    take: 6,
  });
  if (rows.length < 2) return null;
  const [a, b] = shuffle(rows).slice(0, 2);
  return { pair: [a, b], label: `Inside ${club}` };
}

async function buildWildcard(excludeIds: number[]): Promise<{ pair: [PlayerCard, PlayerCard]; label: string } | null> {
  const axes: [string, string, string][] = [
    ["pace_monster", "playmaker", "Pace vs Vision"],
    ["tank", "skill_merchant", "Power vs Flair"],
    ["finisher", "wall", "Scorer vs Stopper"],
    ["pace_monster", "wall", "Speed vs Shield"],
  ];
  const [a, b, label] = axes[randInt(0, axes.length - 1)];
  const left = await withTag(a, { excludeIds, minOvr: 80, not: b });
  if (!left) return null;
  const right = await withTag(b, { excludeIds: [left.id, ...excludeIds], minOvr: 80, not: a });
  return right ? { pair: [left, right], label } : null;
}

async function buildRandom(excludeIds: number[]): Promise<[PlayerCard, PlayerCard] | null> {
  const seed = await highOvrCard({ excludeIds, minOvr: Math.random() < 0.6 ? 80 : 60 });
  if (!seed) return null;
  for (const band of [3, 5, 8, 15]) {
    const opp = await prisma.playerCard.findFirst({
      where: {
        position: { in: BUCKETS[bucketOf(seed.position)] },
        overallRating: { gte: seed.overallRating - band, lte: seed.overallRating + band },
        id: { notIn: [seed.id, ...excludeIds] },
      },
      skip: randInt(0, 20),
    });
    if (opp) return [seed, opp];
  }
  return null;
}

function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- Featured + controversial requeue ---------------------------------------

/** Pull a hand-curated featured Matchup that the session hasn't seen recently. */
async function pickFeatured(excludeIds: number[]): Promise<GeneratedMatchup | null> {
  const featured = await prisma.matchup.findMany({
    where: {
      featured: true,
      leftCardId: excludeIds.length ? { notIn: excludeIds } : undefined,
      rightCardId: excludeIds.length ? { notIn: excludeIds } : undefined,
    },
    include: { leftCard: true, rightCard: true },
    orderBy: { priority: "desc" },
    take: 20,
  });
  if (featured.length === 0) return null;
  const m = featured[randInt(0, featured.length - 1)];
  return {
    id: m.id,
    category: m.category,
    mode: m.mode ?? "featured",
    label: m.label ?? null,
    featured: true,
    left: m.leftCard,
    right: m.rightCard,
  };
}

/** Find a close-vote (controversial) non-featured matchup that this session hasn't voted on. */
async function pickControversialRequeue(
  sessionId: string | null,
  excludeIds: number[],
): Promise<GeneratedMatchup | null> {
  if (!sessionId) return null;
  // Candidates: matchups with ≥ 20 votes, last requeue count < 3, split within 10 points.
  const rows = await prisma.$queryRawUnsafe<{ id: string; l: number; r: number }[]>(`
    SELECT m."id",
      SUM(CASE WHEN v."chosenCardId" = m."leftCardId" THEN 1 ELSE 0 END)::int AS l,
      SUM(CASE WHEN v."chosenCardId" = m."rightCardId" THEN 1 ELSE 0 END)::int AS r
    FROM "Matchup" m
    JOIN "Vote" v ON v."matchupId" = m."id"
    WHERE m."featured" = false AND m."controversialRequeueCount" < 3
    GROUP BY m."id"
    HAVING COUNT(v."id") >= 20
       AND ABS(
         SUM(CASE WHEN v."chosenCardId" = m."leftCardId" THEN 1 ELSE 0 END)
         - SUM(CASE WHEN v."chosenCardId" = m."rightCardId" THEN 1 ELSE 0 END)
       ) * 100.0 / COUNT(v."id") < 10
    ORDER BY random() LIMIT 10
  `);
  if (rows.length === 0) return null;
  for (const row of rows) {
    // Skip if this session already voted on this matchup.
    const voted = await prisma.vote.findFirst({ where: { matchupId: row.id, sessionId }, select: { id: true } });
    if (voted) continue;
    const m = await prisma.matchup.findUnique({
      where: { id: row.id },
      include: { leftCard: true, rightCard: true },
    });
    if (!m || excludeIds.includes(m.leftCardId) || excludeIds.includes(m.rightCardId)) continue;
    await prisma.matchup.update({
      where: { id: row.id },
      data: { controversialRequeueCount: { increment: 1 } },
    });
    return {
      id: m.id,
      category: m.category,
      mode: m.mode ?? "random",
      label: "Hot take — try again",
      featured: false,
      left: m.leftCard,
      right: m.rightCard,
    };
  }
  return null;
}

// --- Public API -------------------------------------------------------------

export interface GeneratedMatchup {
  id: string;
  category: string;
  mode: string;
  label: string | null;
  featured: boolean;
  left: PlayerCard;
  right: PlayerCard;
}

export interface GenerateOptions {
  mode?: Mode;
  recentCardIds?: number[];
  sessionId?: string | null;
  /** True for the first matchup of a session — force a featured one if we have any. */
  opener?: boolean;
}

/**
 * Generate (and persist, for non-featured modes) a matchup.
 * Mode is optional — when missing, we pick one pseudo-randomly with weights.
 */
export async function generateMatchup(opts: GenerateOptions = {}): Promise<GeneratedMatchup | null> {
  const recent = opts.recentCardIds ?? [];

  // 1. Opener — always a featured matchup if we have any the session hasn't seen.
  if (opts.opener) {
    const f = await pickFeatured(recent);
    if (f) return f;
  }

  // 2. Controversial requeue — ~10% of non-first requests.
  if (!opts.mode && !opts.opener && Math.random() < 0.1) {
    const c = await pickControversialRequeue(opts.sessionId ?? null, recent);
    if (c) return c;
  }

  // 3. Mode-driven generator.
  const mode = opts.mode ?? pickWeightedMode();
  const built = await buildForMode(mode, recent);
  if (!built) {
    // Fallback to random if the chosen mode couldn't produce a pair.
    const fallback = await buildRandom(recent);
    if (!fallback) return null;
    return persistAndReturn(fallback, "random", null);
  }

  const label = "label" in built ? built.label : null;
  const pair = "pair" in built ? built.pair : built;
  return persistAndReturn(pair, mode, label);
}

async function buildForMode(
  mode: Mode,
  excludeIds: number[],
): Promise<[PlayerCard, PlayerCard] | { pair: [PlayerCard, PlayerCard]; label: string } | null> {
  switch (mode) {
    case "rivalry":    return buildRivalry(excludeIds);
    case "same-level": return buildSameLevel(excludeIds);
    case "goat":       return buildGoat(excludeIds);
    case "meta":       return buildMeta(excludeIds);
    case "club":       return buildClub(excludeIds);
    case "wildcard":   return buildWildcard(excludeIds);
    case "featured":   {
      const f = await pickFeatured(excludeIds);
      return f ? { pair: [f.left, f.right], label: f.label ?? "Featured" } : null;
    }
    case "random":
    default:           return buildRandom(excludeIds);
  }
}

/** Weighted random mode selection when the caller doesn't specify one. */
function pickWeightedMode(): Mode {
  const weights: Record<Mode, number> = {
    rivalry: 15,
    "same-level": 20,
    goat: 10,
    meta: 10,
    club: 10,
    wildcard: 10,
    featured: 0, // handled via opener/explicit
    random: 25,
  };
  const entries = Object.entries(weights) as [Mode, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [m, w] of entries) {
    r -= w;
    if (r <= 0) return m;
  }
  return "random";
}

async function persistAndReturn(
  pair: [PlayerCard, PlayerCard],
  mode: Mode,
  label: string | null,
): Promise<GeneratedMatchup> {
  const [a, b] = pair;
  const [left, right] = Math.random() < 0.5 ? [a, b] : [b, a];
  const matchup = await prisma.matchup.create({
    data: {
      leftCardId: left.id,
      rightCardId: right.id,
      category: bucketOf(left.position).toLowerCase(),
      mode,
      label,
    },
  });
  return { id: matchup.id, category: matchup.category, mode, label, featured: false, left, right };
}

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
  return { total, pct, votes };
}

/** Which side is the current majority for this matchup? Null if tied or no votes. */
export async function getMajorityCardId(matchupId: string): Promise<number | null> {
  const { votes } = await getMatchupResult(matchupId);
  if (votes.length === 0) return null;
  const sorted = [...votes].sort((a, b) => b._count._all - a._count._all);
  if (sorted.length === 1) return sorted[0].chosenCardId;
  if (sorted[0]._count._all === sorted[1]._count._all) return null;
  return sorted[0].chosenCardId;
}
