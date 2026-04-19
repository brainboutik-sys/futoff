import { prisma } from "./prisma";
import type { PlayerCard, Bracket, BracketMatch } from "@prisma/client";

/**
 * Bracket engine (8-player single elimination).
 *
 *   Daily:  lazy-generated on first access, keyed by UTC date.
 *           Seeds = 8 most-voted cards in the last 48 hours, falling back to top OVR if quiet.
 *   Theme:  hand-seeded via seed script. Same shape.
 *
 * A bracket has 7 matches: 4 QFs, 2 SFs, 1 final. Rounds: 1=QF, 2=SF, 3=F.
 * Winners propagate lazily — when every vote in a match has been cast (or we
 * hit a threshold) the winner is set and the downstream slot filled.
 */

const WINNER_THRESHOLD = 3; // votes needed in a bracket match to "call" the winner (MVP)

function todayKey(): string {
  const d = new Date();
  return `daily-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Pick the 8 seed cards for today's daily bracket. */
async function pickDailySeeds(): Promise<PlayerCard[]> {
  // Prefer cards with recent engagement. Fall back to top-OVR if none.
  const recent = await prisma.$queryRawUnsafe<{ cardId: number; n: bigint }[]>(`
    SELECT "chosenCardId" AS "cardId", COUNT(*)::bigint AS n
    FROM "Vote"
    WHERE "createdAt" > NOW() - INTERVAL '48 hours'
    GROUP BY "chosenCardId"
    ORDER BY n DESC
    LIMIT 24
  `);
  const ids = recent.map((r) => r.cardId);
  let pool: PlayerCard[] = [];
  if (ids.length >= 8) {
    pool = await prisma.playerCard.findMany({ where: { id: { in: ids } } });
  }
  if (pool.length < 8) {
    // Icons are for GOAT mode, not daily brackets — exclude them here.
    const top = await prisma.playerCard.findMany({
      where: { cardType: { not: "icon" } },
      orderBy: [{ overallRating: "desc" }, { id: "asc" }],
      take: 40,
    });
    // Dedupe by club so no club has more than one seat.
    const byClub = new Map<string, PlayerCard>();
    for (const c of top) {
      const key = c.club ?? `_${c.id}`;
      if (!byClub.has(key)) byClub.set(key, c);
      if (byClub.size >= 8) break;
    }
    pool = Array.from(byClub.values());
  }
  return pool.slice(0, 8);
}

/** Create a bracket with 8 seeds, writing QF matches and empty SF/F slots. */
export async function createBracket(params: {
  id: string;
  title: string;
  kind: "daily" | "theme";
  seedDate?: Date;
  seedCards: PlayerCard[]; // length 8
}): Promise<Bracket> {
  if (params.seedCards.length !== 8) {
    throw new Error(`bracket needs exactly 8 seeds, got ${params.seedCards.length}`);
  }
  const bracket = await prisma.bracket.create({
    data: {
      id: params.id,
      title: params.title,
      kind: params.kind,
      seedDate: params.seedDate ?? null,
    },
  });
  // QFs — pair by seeding 1v8, 4v5, 2v7, 3v6 (classic seed order).
  const s = params.seedCards;
  const qfPairs: [PlayerCard, PlayerCard][] = [
    [s[0], s[7]],
    [s[3], s[4]],
    [s[1], s[6]],
    [s[2], s[5]],
  ];
  await prisma.bracketMatch.createMany({
    data: [
      ...qfPairs.map((p, i) => ({
        bracketId: bracket.id,
        round: 1,
        slot: i,
        leftCardId: p[0].id,
        rightCardId: p[1].id,
      })),
      { bracketId: bracket.id, round: 2, slot: 0 },
      { bracketId: bracket.id, round: 2, slot: 1 },
      { bracketId: bracket.id, round: 3, slot: 0 },
    ],
  });
  return bracket;
}

/** Get (or lazily create) today's daily bracket. */
export async function getOrCreateDaily(): Promise<BracketWithMatches> {
  const id = todayKey();
  const existing = await loadBracket(id);
  if (existing) return existing;
  const seeds = await pickDailySeeds();
  if (seeds.length < 8) throw new Error("not enough cards for a bracket");
  const today = new Date();
  const dayOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await createBracket({ id, title: "Daily Bracket", kind: "daily", seedDate: dayOnly, seedCards: seeds });
  const fresh = await loadBracket(id);
  if (!fresh) throw new Error("bracket creation race");
  return fresh;
}

export interface BracketWithMatches extends Bracket {
  matches: (BracketMatch & {
    leftCard: PlayerCard | null;
    rightCard: PlayerCard | null;
    winnerCard: PlayerCard | null;
    _counts: { leftVotes: number; rightVotes: number };
  })[];
}

export async function loadBracket(id: string): Promise<BracketWithMatches | null> {
  const bracket = await prisma.bracket.findUnique({
    where: { id },
    include: {
      matches: {
        include: { leftCard: true, rightCard: true, winnerCard: true },
        orderBy: [{ round: "asc" }, { slot: "asc" }],
      },
    },
  });
  if (!bracket) return null;
  // Attach per-match vote counts in one go.
  const counts = await prisma.bracketVote.groupBy({
    by: ["matchId", "chosenCardId"],
    where: { matchId: { in: bracket.matches.map((m) => m.id) } },
    _count: { _all: true },
  });
  return {
    ...bracket,
    matches: bracket.matches.map((m) => {
      const l = counts.find((c) => c.matchId === m.id && c.chosenCardId === m.leftCardId)?._count._all ?? 0;
      const r = counts.find((c) => c.matchId === m.id && c.chosenCardId === m.rightCardId)?._count._all ?? 0;
      return { ...m, _counts: { leftVotes: l, rightVotes: r } };
    }),
  };
}

/** Record a bracket vote and, if threshold met, advance the winner to the next round slot. */
export async function voteBracketMatch(matchId: string, chosenCardId: number, sessionId: string) {
  const match = await prisma.bracketMatch.findUnique({
    where: { id: matchId },
    select: { id: true, bracketId: true, round: true, slot: true, leftCardId: true, rightCardId: true, winnerCardId: true },
  });
  if (!match) throw new Error("match_not_found");
  if (match.winnerCardId) throw new Error("match_closed");
  if (chosenCardId !== match.leftCardId && chosenCardId !== match.rightCardId) {
    throw new Error("chosen_not_in_match");
  }
  // Reject duplicate votes from same session on same match.
  const dupe = await prisma.bracketVote.findFirst({ where: { matchId, sessionId }, select: { id: true } });
  if (dupe) throw new Error("already_voted");

  await prisma.bracketVote.create({
    data: { matchId, chosenCardId, sessionId },
  });

  // Check if we should close the match.
  const agg = await prisma.bracketVote.groupBy({
    by: ["chosenCardId"],
    where: { matchId },
    _count: { _all: true },
  });
  const total = agg.reduce((s, v) => s + v._count._all, 0);
  if (total >= WINNER_THRESHOLD) {
    const sorted = [...agg].sort((a, b) => b._count._all - a._count._all);
    if (sorted.length === 1 || sorted[0]._count._all > sorted[1]._count._all) {
      const winner = sorted[0].chosenCardId;
      await prisma.bracketMatch.update({
        where: { id: matchId },
        data: { winnerCardId: winner },
      });
      await propagate(match.bracketId, match.round, match.slot, winner);
    }
  }
}

/** Fill the appropriate side of the next-round match when a winner is known. */
async function propagate(bracketId: string, round: number, slot: number, winnerId: number) {
  if (round >= 3) return;
  const nextSlot = Math.floor(slot / 2);
  const isLeft = slot % 2 === 0;
  const next = await prisma.bracketMatch.findFirst({
    where: { bracketId, round: round + 1, slot: nextSlot },
  });
  if (!next) return;
  await prisma.bracketMatch.update({
    where: { id: next.id },
    data: isLeft ? { leftCardId: winnerId } : { rightCardId: winnerId },
  });
}
