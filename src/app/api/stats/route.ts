import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const stats = await prisma.userStats.findUnique({ where: { sessionId } });
  if (!stats) {
    return NextResponse.json({
      totalVotes: 0,
      currentStreak: 0,
      bestStreak: 0,
      agreementPct: 0,
    });
  }
  return NextResponse.json({
    totalVotes: stats.totalVotes,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    agreementPct: stats.totalVotes > 0
      ? Math.round((stats.agreementVotes / stats.totalVotes) * 100)
      : 0,
  });
}
