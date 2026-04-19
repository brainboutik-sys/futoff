"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerCard as PlayerCardT } from "@prisma/client";
import { PlayerCard } from "./PlayerCard";
import { VoteResultOverlay } from "./VoteResultOverlay";
import { LoadingTransition } from "./LoadingTransition";

type Matchup = { id: string; category: string; left: PlayerCardT; right: PlayerCardT };
type VoteResult = { total: number; leftPct: number; rightPct: number };

const RECENT_MAX = 30;      // ring-buffer size for anti-repeat card IDs
const RESULT_HOLD_MS = 900; // how long to show the split before auto-advancing

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
  const [streak, setStreak] = useState(0);
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

  const fetchNext = useCallback(async () => {
    setState({ phase: "loading", matchup: null });
    try {
      const qs = recentRef.current.length
        ? `?recent=${recentRef.current.join(",")}`
        : "";
      const res = await fetch(`/api/matchup${qs}`, { cache: "no-store" });
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
  }, [pushRecent]);

  // Bootstrap when server didn't hand us an initial matchup.
  useEffect(() => {
    if (!initialMatchup) fetchNext();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [initialMatchup, fetchNext]);

  const vote = useCallback(
    async (side: "left" | "right") => {
      if (state.phase !== "ready") return;
      const { matchup } = state;
      const chosenCardId = side === "left" ? matchup.left.id : matchup.right.id;
      setState({ phase: "voting", matchup, chosen: side });
      setStreak((s) => s + 1);

      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ matchupId: matchup.id, chosenCardId }),
        });
        const data = (await res.json()) as VoteResult | { error: string };
        if ("error" in data) throw new Error(data.error);
        setState({ phase: "voting", matchup, chosen: side, result: data });
      } catch {
        // Even if the vote persist fails, still advance — don't block the loop.
      }

      advanceTimer.current = setTimeout(fetchNext, RESULT_HOLD_MS);
    },
    [state, fetchNext],
  );

  // Keyboard: ← / A for left, → / D for right
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase !== "ready") return;
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") vote("left");
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") vote("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, vote]);

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-md text-center mt-24 px-6">
        <h1 className="text-2xl font-bold">Can&apos;t load a matchup</h1>
        <p className="text-muted mt-2 text-sm">{state.message}</p>
        <p className="text-muted mt-4 text-xs">
          Did you run <code className="text-accent">pnpm import</code>?
        </p>
        <button
          onClick={fetchNext}
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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
          Pick <span className="text-accent">one</span>.
        </h1>
        <div className="flex items-center gap-4 text-xs sm:text-sm text-muted">
          <span>
            streak <span className="text-ink font-bold tabular-nums">{streak}</span>
          </span>
          <span className="hidden sm:inline">← A · D →</span>
        </div>
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
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

      <div className="h-16 mt-6 flex items-center justify-center">
        {state.phase === "loading" && <LoadingTransition />}
        {state.phase === "voting" && result && (
          <VoteResultOverlay
            leftPct={result.leftPct}
            rightPct={result.rightPct}
            total={result.total}
            chosenSide={state.chosen}
          />
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="w-full max-w-[340px] aspect-[3/4] rounded-3xl card-surface animate-pulse" />
  );
}
