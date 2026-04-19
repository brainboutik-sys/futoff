"use client";
import { useCallback, useEffect, useState } from "react";
import type { PlayerCard as PlayerCardT } from "@prisma/client";
import { cn } from "@/lib/utils";

type Match = {
  id: string;
  round: number;
  slot: number;
  leftCardId: number | null;
  rightCardId: number | null;
  winnerCardId: number | null;
  leftCard: PlayerCardT | null;
  rightCard: PlayerCardT | null;
  winnerCard: PlayerCardT | null;
  _counts: { leftVotes: number; rightVotes: number };
};

type BracketData = {
  id: string;
  title: string;
  kind: string;
  matches: Match[];
};

export function BracketView({ bracketId }: { bracketId: string }) {
  const [bracket, setBracket] = useState<BracketData | null>(null);
  const [votedMatchIds, setVotedMatchIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const endpoint = bracketId === "daily" ? "/api/bracket/daily" : `/api/bracket/${bracketId}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`bracket fetch failed (${res.status})`);
      const data = (await res.json()) as BracketData;
      setBracket(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [bracketId]);

  useEffect(() => { load(); }, [load]);

  const vote = useCallback(
    async (match: Match, cardId: number) => {
      if (votedMatchIds.has(match.id) || match.winnerCardId) return;
      setVotedMatchIds((s) => new Set(s).add(match.id));
      try {
        const res = await fetch("/api/bracket/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ matchId: match.id, chosenCardId: cardId }),
        });
        if (!res.ok && res.status !== 409 /* already_voted */) {
          // revert
          setVotedMatchIds((s) => { const n = new Set(s); n.delete(match.id); return n; });
        }
      } finally {
        load();
      }
    },
    [votedMatchIds, load],
  );

  if (err) return <div className="mx-auto max-w-lg text-center mt-20 text-muted">{err}</div>;
  if (!bracket) return <div className="mx-auto max-w-lg text-center mt-20 text-muted">Loading bracket…</div>;

  const byRound: Record<number, Match[]> = { 1: [], 2: [], 3: [] };
  for (const m of bracket.matches) byRound[m.round]?.push(m);
  for (const r of Object.keys(byRound)) byRound[Number(r)].sort((a, b) => a.slot - b.slot);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{bracket.title}</h1>
        <span className="text-xs text-muted tracking-widest uppercase">{bracket.kind === "daily" ? "today" : "themed"}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
        <RoundColumn title="Quarterfinals" matches={byRound[1]} vote={vote} voted={votedMatchIds} />
        <RoundColumn title="Semifinals"   matches={byRound[2]} vote={vote} voted={votedMatchIds} />
        <RoundColumn title="Final"        matches={byRound[3]} vote={vote} voted={votedMatchIds} />
      </div>

      <p className="mt-8 text-xs text-muted text-center">
        Winners resolve once a match has 3+ votes. Come back throughout the day.
      </p>
    </div>
  );
}

function RoundColumn({
  title,
  matches,
  vote,
  voted,
}: {
  title: string;
  matches: Match[];
  vote: (m: Match, id: number) => void;
  voted: Set<string>;
}) {
  return (
    <div>
      <div className="text-xs tracking-[0.2em] text-muted uppercase mb-3">{title}</div>
      <div className="space-y-3">
        {matches.map((m) => (
          <BracketMatchCard key={m.id} match={m} vote={vote} hasVoted={voted.has(m.id)} />
        ))}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  vote,
  hasVoted,
}: {
  match: Match;
  vote: (m: Match, id: number) => void;
  hasVoted: boolean;
}) {
  const pending = !match.leftCard || !match.rightCard;
  const total = match._counts.leftVotes + match._counts.rightVotes;
  const leftPct = total > 0 ? Math.round((match._counts.leftVotes / total) * 100) : 0;
  const rightPct = total > 0 ? 100 - leftPct : 0;
  const closed = !!match.winnerCardId;
  const locked = closed || hasVoted;

  return (
    <div className="card-surface rounded-2xl p-3 space-y-2">
      <Side
        side="left"
        card={match.leftCard}
        pct={leftPct}
        isWinner={match.winnerCardId === match.leftCardId}
        disabled={pending || locked}
        onPick={match.leftCard ? () => vote(match, match.leftCard!.id) : undefined}
      />
      <div className="text-[10px] text-muted text-center">
        {pending ? "waiting for winners" : total > 0 ? `${total} vote${total === 1 ? "" : "s"}` : "no votes yet"}
      </div>
      <Side
        side="right"
        card={match.rightCard}
        pct={rightPct}
        isWinner={match.winnerCardId === match.rightCardId}
        disabled={pending || locked}
        onPick={match.rightCard ? () => vote(match, match.rightCard!.id) : undefined}
      />
    </div>
  );
}

function Side({
  side,
  card,
  pct,
  isWinner,
  disabled,
  onPick,
}: {
  side: "left" | "right";
  card: PlayerCardT | null;
  pct: number;
  isWinner: boolean;
  disabled: boolean;
  onPick?: () => void;
}) {
  if (!card) {
    return (
      <div className="flex items-center gap-2 h-12 px-2 rounded-lg bg-white/5 text-muted text-xs italic">
        TBD
      </div>
    );
  }
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-3 w-full h-14 px-2 rounded-lg overflow-hidden text-left transition",
        "bg-white/5 hover:bg-white/10 disabled:hover:bg-white/5",
        isWinner && "ring-2 ring-win",
        disabled && "cursor-default",
        !card && "opacity-50",
      )}
      aria-label={`Pick ${card.displayName}`}
    >
      <div
        className="absolute inset-y-0 left-0 bg-accent/15"
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex items-center gap-3 w-full">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="w-10 h-10 object-contain shrink-0" />
        ) : (
          <div className="w-10 h-10 shrink-0 rounded bg-white/10" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate flex items-center gap-1.5">
            {card.displayName}
            {isWinner && <span className="text-[10px] text-win">✓</span>}
          </div>
          <div className="text-[10px] text-muted truncate">
            {card.club ?? "Icons"} · OVR {card.overallRating}
          </div>
        </div>
        <div className="text-sm font-black tabular-nums text-accent">{pct}%</div>
      </div>
    </button>
  );
}
