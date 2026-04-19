import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { wilsonScore } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 30; // cheap refresh — the endpoint is aggregated

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const minAppearances = Number.parseInt(url.searchParams.get("min") ?? "5", 10) || 5;

  // Aggregate: for each card, count wins (votes where it was chosen) and appearances (matchups it appeared in).
  const wins = await prisma.vote.groupBy({
    by: ["chosenCardId"],
    _count: { _all: true },
  });
  const winMap = new Map(wins.map((w) => [w.chosenCardId, w._count._all]));

  const appearances = await prisma.$queryRawUnsafe<{ cardId: number; appearances: number }[]>(`
    SELECT "cardId", SUM(cnt)::int AS appearances FROM (
      SELECT m."leftCardId" AS "cardId", COUNT(v.id) AS cnt
        FROM "Matchup" m LEFT JOIN "Vote" v ON v."matchupId" = m.id GROUP BY m."leftCardId"
      UNION ALL
      SELECT m."rightCardId" AS "cardId", COUNT(v.id) AS cnt
        FROM "Matchup" m LEFT JOIN "Vote" v ON v."matchupId" = m.id GROUP BY m."rightCardId"
    ) t GROUP BY "cardId"
  `);

  const ranked = appearances
    .filter((a) => a.appearances >= minAppearances)
    .map((a) => {
      const w = winMap.get(a.cardId) ?? 0;
      return {
        cardId: a.cardId,
        wins: w,
        appearances: Number(a.appearances),
        score: wilsonScore(w, Number(a.appearances)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const cards = await prisma.playerCard.findMany({
    where: { id: { in: ranked.map((r) => r.cardId) } },
  });
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  return NextResponse.json({
    rankings: ranked
      .map((r) => ({ ...r, card: cardMap.get(r.cardId) }))
      .filter((r) => r.card),
  });
}
