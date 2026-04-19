import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import { getMatchupResult } from "@/lib/matchup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessionId = await getOrCreateSessionId();
  const body = await req.json().catch(() => null) as { matchupId?: string; chosenCardId?: number } | null;
  if (!body?.matchupId || !body.chosenCardId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const matchup = await prisma.matchup.findUnique({
    where: { id: body.matchupId },
    select: { id: true, leftCardId: true, rightCardId: true },
  });
  if (!matchup) return NextResponse.json({ error: "matchup_not_found" }, { status: 404 });

  if (body.chosenCardId !== matchup.leftCardId && body.chosenCardId !== matchup.rightCardId) {
    return NextResponse.json({ error: "chosen_not_in_matchup" }, { status: 400 });
  }

  await prisma.vote.create({
    data: {
      matchupId: matchup.id,
      chosenCardId: body.chosenCardId,
      sessionId,
    },
  });

  const result = await getMatchupResult(matchup.id);
  return NextResponse.json({
    ok: true,
    total: result.total,
    leftPct: result.pct(matchup.leftCardId),
    rightPct: result.pct(matchup.rightCardId),
  });
}
