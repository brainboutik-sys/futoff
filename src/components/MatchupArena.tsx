"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerCard as PlayerCardT } from "@prisma/client";
import { PlayerCard } from "./PlayerCard";
import { VoteResultOverlay } from "./VoteResultOverlay";
import { LoadingTransition } from "./LoadingTransition";
import { ModeSelector, type Mode } from "./ModeSelector";
import { cn } from "@/lib/utils";

type Matchup = {
  id: string;
  category: string;
  mode: string;
  label: string | null;
  featured: boolean;
  left: PlayerCardT;
  right: PlayerCardT;
};
type VoteResult = {
  total: number;
  leftPct: number;
  rightPct: number;
  agreedWithMajority: boolean;
  stats: { totalVotes: number; currentStreak: number; bestStreak: number; agreementPct: number };
};

const RECENT_MAX = 30;
const RESULT_HOLD_MS = 1100;

type State =
  | { phase: "loading"; matchup: null }
  | { phase: "ready"; matchup: Matchup }
  | { phase: "voting"; matchup: Matchup; chosen: "left" | "right"; result?: VoteResult }
  | { phase: "error"; message: string; matchup: null };

export function MatchupArena({ initialMatchup }: { initialMatchup: Matchup | null }) {
  const [state, setState] = useState<State>(
    initialMatchup
      ? { phase: "ready", matchup: initialMatchup }
      : { phase: "loading", matchup: null },
  );
  const [mode, setMode] = useState<Mode | null>(null); // null = auto
  const [stats, setStats] = useState<VoteResult["stats"]>({
    totalVotes: 0,
    currentStreak: 0,
    bestStreak: 0,
    agreementPct: 0,
  });
  const [shareCopied, setShareCopied] = useState(false);
  const recentRef = useRef<number[]>([]);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushRecent = useCallback((ids: number[]) => {
    for (const id of ids) {
      recentRef.current = recentRef.current.filter((x) => x !== id);
      recentRef.current.unshift(id);
    }
    if (recentRef.current.length > RECENT_MAX) {
      recentRef.current = recentRef.current.slice(0, RECENT_MAX);
    }
  }, []);

  // Fetch persistent stats on mount.
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  const fetchNext = useCallback(
    async (forceMode?: Mode | null) => {
      setState({ phase: "loading", matchup: null });
      const activeMode = forceMode ?? mode;
      try {
        const params = new URLSearchParams();
        if (recentRef.current.length) params.set("recent", recentRef.current.join(","));
        if (activeMode) params.set("mode", activeMode);
        const res = await fetch(`/api/matchup?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Matchup unavailable");
        }
        const matchup = (await res.json()) as Matchup;
        pushRecent([matchup.left.id, matchup.right.id]);
        setState({ phase: "ready", matchup });
      } catch (err) {
        setState({
          phase: "error",
          matchup: null,
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    },
    [mode, pushRecent],
  );

  useEffect(() => {
    if (!initialMatchup) fetchNext();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = useCallback(
    (m: Mode | null) => {
      setMode(m);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      fetchNext(m);
    },
    [fetchNext],
  );

  const vote = useCallback(
    async (side: "left" | "right") => {
      if (state.phase !== "ready") return;
      const { matchup } = state;
      const chosenCardId = side === "left" ? matchup.left.id : matchup.right.id;
      setState({ phase: "voting", matchup, chosen: side });

      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ matchupId: matchup.id, chosenCardId }),
        });
        const data = (await res.json()) as VoteResult | { error: string };
        if ("error" in data) throw new Error(data.error);
        setStats(data.stats);
        setState({ phase: "voting", matchup, chosen: side, result: data });
      } catch {
        // swallow — still advance
      }

      advanceTimer.current = setTimeout(() => fetchNext(), RESULT_HOLD_MS);
    },
    [state, fetchNext],
  );

  const copyShare = useCallback(async () => {
    if (state.phase === "loading" || state.phase === "error") return;
    const m = state.matchup;
    const url = `${window.location.origin}/matchup/${m.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${m.left.displayName} vs ${m.right.displayName} — FUTOFF`,
          text: `${m.left.displayName} vs ${m.right.displayName}. Pick one.`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1400);
      }
    } catch {
      /* user cancelled share sheet — ignore */
    }
  }, [state]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase !== "ready") return;
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") vote("left");
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") vote("right");
      if (e.key.toLowerCase() === "s") copyShare();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, vote, copyShare]);

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-md text-center mt-24 px-6">
        <h1 className="text-2xl font-bold">Can&apos;t load a matchup</h1>
        <p className="text-muted mt-2 text-sm">{state.message}</p>
        <button
          onClick={() => fetchNext()}
          className="mt-6 px-4 py-2 rounded-lg bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
        >
          Retry
        </button>
      </div>
    );
  }

  const matchup = state.phase === "loading" ? null : state.matchup;
  const chosen = state.phase === "voting" ? state.chosen : null;
  const result = state.phase === "voting" ? state.result : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Top bar: title + stats */}
      <div className="flex items-start justify-between gap-4 mb-3 sm:mb-5">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            Pick <span className="text-accent">one</span>.
          </h1>
          {matchup?.label && (
            <div className="text-xs sm:text-sm text-muted mt-1 tracking-wider uppercase">
              {matchup.featured ? "⭐ " : ""}{matchup.label}
            </div>
          )}
        </div>
        <StatsRow stats={stats} />
      </div>

      <ModeSelector value={mode} onChange={switchMode} disabled={state.phase === "voting"} />

      {/* Cards */}
      <div className="relative grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 mt-6">
        <div className="flex justify-center animate-pop" key={matchup?.left.id ?? "l-empty"}>
          {matchup ? (
            <PlayerCard
              card={matchup.left}
              onPick={() => vote("left")}
              disabled={state.phase === "voting"}
              highlight={chosen ? (chosen === "left" ? "win" : "loss") : null}
              pctLabel={result ? result.leftPct : null}
              side="left"
            />
          ) : (
            <SkeletonCard />
          )}
        </div>

        <div className="hidden sm:flex items-center justify-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 versus-ring rounded-full blur-lg" />
            <span className="relative text-xs font-black tracking-[0.3em] text-accent">VS</span>
          </div>
        </div>

        <div className="flex justify-center animate-pop" key={matchup?.right.id ?? "r-empty"}>
          {matchup ? (
            <PlayerCard
              card={matchup.right}
              onPick={() => vote("right")}
              disabled={state.phase === "voting"}
              highlight={chosen ? (chosen === "right" ? "win" : "loss") : null}
              pctLabel={result ? result.rightPct : null}
              side="right"
            />
          ) : (
            <SkeletonCard />
          )}
        </div>
      </div>

      {/* Bottom: result overlay + actions */}
      <div className="h-20 mt-6 flex items-center justify-center gap-3 flex-wrap">
        {state.phase === "loading" && <LoadingTransition />}
        {state.phase === "voting" && result && (
          <>
            <VoteResultOverlay
              leftPct={result.leftPct}
              rightPct={result.rightPct}
              total={result.total}
              chosenSide={state.chosen}
            />
            {result.agreedWithMajority && result.stats.currentStreak >= 3 && (
              <div className="rounded-xl px-3 py-2 bg-win/15 text-win text-sm font-bold animate-slideUp">
                🔥 {result.stats.currentStreak} streak
              </div>
            )}
          </>
        )}
      </div>

      {/* Share + hint row */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span className="hidden sm:inline">← A · D → · S share</span>
        <button
          onClick={copyShare}
          disabled={!matchup}
          className={cn(
            "px-3 py-1.5 rounded-md border border-line hover:bg-white/5 text-ink transition disabled:opacity-40",
            shareCopied && "border-win text-win",
          )}
        >
          {shareCopied ? "Copied!" : "Share"}
        </button>
      </div>
    </div>
  );
}

function StatsRow({ stats }: { stats: VoteResult["stats"] }) {
  return (
    <div className="flex items-center gap-3 sm:gap-5 text-[11px] sm:text-xs">
      <Stat label="votes" value={stats.totalVotes} />
      <Stat label="streak" value={stats.currentStreak} accent={stats.currentStreak >= 3} />
      <Stat label="best" value={stats.bestStreak} />
      <Stat
        label="agree"
        value={stats.totalVotes > 0 ? `${stats.agreementPct}%` : "—"}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className={cn("font-black tabular-nums text-base sm:text-xl", accent && "text-accent")}>
        {value}
      </span>
      <span className="uppercase tracking-widest text-muted mt-0.5">{label}</span>
    </div>
  );
}

function SkeletonCard() {
  return <div className="w-full max-w-[340px] aspect-[3/4] rounded-3xl card-surface animate-pulse" />;
}
