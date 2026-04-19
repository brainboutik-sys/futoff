import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { getMatchupResult } from "@/lib/matchup";
import { updateRatings } from "@/lib/elo";

export const dynamic = "force-dynamic";

/**
 * POST /api/vote
 *   body: { matchupId, chosenCardId }
 *
 * On every vote we:
 *   1. Persist the Vote row
 *   2. Update ELO on both cards (zero-sum) in a transaction
 *   3. Update UserStats (total, streak, best, agreement)
 *   4. Return live split + streak/agreement state for UI
 */
export async function POST(req: Request) {
  const sessionId = await getOrCreateSessionId();
  const body = (await req.json().catch(() => null)) as
    | { matchupId?: string; chosenCardId?: number }
    | null;
  if (!body?.matchupId || !body.chosenCardId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const matchup = await prisma.matchup.findUnique({
    where: { id: body.matchupId },
    select: {
      id: true,
      leftCardId: true,
      rightCardId: true,
      leftCard: { select: { id: true, eloRating: true, eloMatches: true } },
      rightCard: { select: { id: true, eloRating: true, eloMatches: true } },
    },
  });
  if (!matchup) return NextResponse.json({ error: "matchup_not_found" }, { status: 404 });

  if (body.chosenCardId !== matchup.leftCardId && body.chosenCardId !== matchup.rightCardId) {
    return NextResponse.json({ error: "chosen_not_in_matchup" }, { status: 400 });
  }

  const leftWon = body.chosenCardId === matchup.leftCardId;
  const { newA: newLeft, newB: newRight } = updateRatings(
    matchup.leftCard.eloRating,
    matchup.rightCard.eloRating,
    matchup.leftCard.eloMatches,
    matchup.rightCard.eloMatches,
    leftWon,
  );

  await prisma.$transaction([
    prisma.vote.create({
      data: {
        matchupId: matchup.id,
        chosenCardId: body.chosenCardId,
        sessionId,
      },
    }),
    prisma.playerCard.update({
      where: { id: matchup.leftCardId },
      data: { eloRating: newLeft, eloMatches: { increment: 1 } },
    }),
    prisma.playerCard.update({
      where: { id: matchup.rightCardId },
      data: { eloRating: newRight, eloMatches: { increment: 1 } },
    }),
  ]);

  // After writing, compute the split (including this vote) and agreement.
  const result = await getMatchupResult(matchup.id);
  const leftPct = result.pct(matchup.leftCardId);
  const rightPct = result.pct(matchup.rightCardId);
  const chosenPct = leftWon ? leftPct : rightPct;
  const agreedWithMajority = chosenPct > 50;

  // Update user stats. Streak = consecutive votes where user agreed with majority.
  const stats = await prisma.userStats.upsert({
    where: { sessionId },
    create: {
      sessionId,
      totalVotes: 1,
      currentStreak: agreedWithMajority ? 1 : 0,
      bestStreak: agreedWithMajority ? 1 : 0,
      agreementVotes: agreedWithMajority ? 1 : 0,
    },
    update: {
      totalVotes: { increment: 1 },
      currentStreak: agreedWithMajority ? { increment: 1 } : 0,
      agreementVotes: agreedWithMajority ? { increment: 1 } : undefined,
    },
  });
  // If the new streak beats best, push best up.
  if (stats.currentStreak > stats.bestStreak) {
    await prisma.userStats.update({
      where: { sessionId },
      data: { bestStreak: stats.currentStreak },
    });
  }

  return NextResponse.json({
    ok: true,
    total: result.total,
    leftPct,
    rightPct,
    agreedWithMajority,
    stats: {
      totalVotes: stats.totalVotes,
      currentStreak: agreedWithMajority ? stats.currentStreak : 0,
      bestStreak: Math.max(stats.bestStreak, stats.currentStreak),
      agreementPct: stats.totalVotes > 0
        ? Math.round((stats.agreementVotes / stats.totalVotes) * 100)
        : 0,
    },
  });
}
