import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getMatchup(id: string) {
  return prisma.matchup.findUnique({
    where: { id },
    include: { leftCard: true, rightCard: true, votes: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getMatchup(id);
  if (!m) return { title: "Matchup not found — FUTOFF" };
  const title = `${m.leftCard.displayName} vs ${m.rightCard.displayName} — FUTOFF`;
  const description = m.label ?? "Pick one. Next matchup in one click.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/share/${id}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`/api/share/${id}`] },
  };
}

export default async function MatchupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMatchup(id);
  if (!m) notFound();

  const total = m.votes.length;
  const leftVotes = m.votes.filter((v) => v.chosenCardId === m.leftCardId).length;
  const rightVotes = total - leftVotes;
  const leftPct = total > 0 ? Math.round((leftVotes / total) * 100) : 0;
  const rightPct = total > 0 ? 100 - leftPct : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-xs tracking-[0.2em] text-muted uppercase mb-2">
        {m.label ?? m.mode ?? "Matchup"}
      </div>
      <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
        {m.leftCard.displayName} <span className="text-accent">vs</span> {m.rightCard.displayName}
      </h1>

      <div className="mt-8 card-surface rounded-2xl p-6">
        <div className="flex items-center justify-between text-sm text-muted mb-3">
          <span>{total.toLocaleString()} vote{total === 1 ? "" : "s"}</span>
          <Link href="/" className="text-accent">Play more →</Link>
        </div>
        <div className="space-y-3">
          <Row card={m.leftCard} pct={leftPct} votes={leftVotes} winning={leftVotes > rightVotes} />
          <Row card={m.rightCard} pct={rightPct} votes={rightVotes} winning={rightVotes > leftVotes} />
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-lg bg-accent text-bg font-bold hover:bg-accent/90"
        >
          Pick your own
        </Link>
      </div>
    </div>
  );
}

function Row({ card, pct, votes, winning }: { card: { displayName: string; imageUrl: string | null; club: string | null; overallRating: number; position: string }; pct: number; votes: number; winning: boolean }) {
  return (
    <div className="relative rounded-xl bg-white/5 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${winning ? "bg-win/20" : "bg-white/5"}`}
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex items-center gap-4 p-3">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="w-14 h-14 object-contain" />
        ) : (
          <div className="w-14 h-14 bg-white/10 rounded" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{card.displayName}</div>
          <div className="text-xs text-muted truncate">
            {card.club ?? "Icons"} · {card.position} · OVR {card.overallRating}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black tabular-nums ${winning ? "text-win" : "text-ink"}`}>{pct}%</div>
          <div className="text-[10px] text-muted">{votes} votes</div>
        </div>
      </div>
    </div>
  );
}
