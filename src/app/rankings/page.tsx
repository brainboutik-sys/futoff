import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 30;

async function getRankings(limit = 100, minMatches = 3) {
  return prisma.playerCard.findMany({
    where: { eloMatches: { gte: minMatches } },
    orderBy: [{ eloRating: "desc" }, { overallRating: "desc" }],
    take: limit,
  });
}

export default async function RankingsPage() {
  const rankings = await getRankings();
  const totalVotes = await prisma.vote.count();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Community Rankings</h1>
          <p className="text-muted text-sm mt-1">
            ELO rating, updated on every vote. Min 3 matches played.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div className="text-2xl font-black tabular-nums text-ink">{totalVotes.toLocaleString()}</div>
          <div>total votes cast</div>
        </div>
      </div>

      {rankings.length === 0 ? (
        <div className="mt-10 p-6 card-surface rounded-2xl text-center text-muted">
          No ELO data yet. Play a few matchups on{" "}
          <Link href="/" className="text-accent">the home page</Link>.
        </div>
      ) : (
        <ol className="mt-8 space-y-2">
          {rankings.map((card, i) => (
            <li key={card.id} className="flex items-center gap-4 p-3 rounded-xl card-surface">
              <div className="w-8 text-center text-muted font-black tabular-nums">{i + 1}</div>
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt={card.displayName} className="w-12 h-12 object-contain" />
              ) : (
                <div className="w-12 h-12 bg-white/5 rounded flex items-center justify-center text-[10px] text-muted">
                  {card.cardType === "icon" ? "★" : "—"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate flex items-center gap-2">
                  {card.displayName}
                  {card.cardType === "icon" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold/20 text-gold tracking-wider uppercase">
                      icon
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {card.club ?? card.league} · {card.position} · OVR {card.overallRating}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black tabular-nums text-accent">{card.eloRating}</div>
                <div className="text-[10px] text-muted">{card.eloMatches} match{card.eloMatches === 1 ? "" : "es"}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
