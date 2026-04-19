import { prisma } from "@/lib/prisma";
import { wilsonScore } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 30;

async function getRankings(limit = 50, minAppearances = 5) {
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
    .filter((a) => Number(a.appearances) >= minAppearances)
    .map((a) => {
      const w = winMap.get(a.cardId) ?? 0;
      const n = Number(a.appearances);
      return { cardId: a.cardId, wins: w, appearances: n, score: wilsonScore(w, n) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) return [];
  const cards = await prisma.playerCard.findMany({
    where: { id: { in: ranked.map((r) => r.cardId) } },
  });
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  return ranked.map((r) => ({ ...r, card: cardMap.get(r.cardId)! })).filter((r) => r.card);
}

export default async function RankingsPage() {
  const rankings = await getRankings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight">Rankings</h1>
      <p className="text-muted text-sm mt-1">
        Ordered by Wilson lower-bound win rate. Minimum 5 appearances.
      </p>

      {rankings.length === 0 ? (
        <div className="mt-10 p-6 card-surface rounded-2xl text-center text-muted">
          No votes yet. Go <a href="/" className="text-accent">play a few matchups</a> to populate the leaderboard.
        </div>
      ) : (
        <ol className="mt-8 space-y-2">
          {rankings.map((row, i) => {
            const rate = row.appearances ? Math.round((row.wins / row.appearances) * 100) : 0;
            return (
              <li
                key={row.cardId}
                className="flex items-center gap-4 p-3 rounded-xl card-surface"
              >
                <div className="w-8 text-center text-muted font-black tabular-nums">{i + 1}</div>
                {row.card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.card.imageUrl}
                    alt={row.card.displayName}
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-white/5 rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{row.card.displayName}</div>
                  <div className="text-[11px] text-muted truncate">
                    {row.card.club} · {row.card.position} · OVR {row.card.overallRating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black tabular-nums text-win">{rate}%</div>
                  <div className="text-[10px] text-muted">
                    {row.wins}/{row.appearances}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
