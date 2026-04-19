import { cn } from "@/lib/utils";

type Props = {
  leftPct: number;
  rightPct: number;
  total: number;
  chosenSide: "left" | "right";
};

export function VoteResultOverlay({ leftPct, rightPct, total, chosenSide }: Props) {
  const agree = chosenSide === "left" ? leftPct : rightPct;
  const message =
    agree >= 80 ? "Consensus pick" :
    agree >= 60 ? "Popular call" :
    agree >= 40 ? "Split decision" :
    "Hot take";

  return (
    <div className="animate-slideUp rounded-2xl px-5 py-3 card-surface text-center min-w-[260px]">
      <div className="text-[11px] tracking-[0.2em] text-muted uppercase">{message}</div>
      <div className="mt-1 flex items-center justify-center gap-4 text-sm">
        <span className={cn("tabular-nums font-bold", chosenSide === "left" && "text-win")}>
          {leftPct}%
        </span>
        <span className="text-muted">vs</span>
        <span className={cn("tabular-nums font-bold", chosenSide === "right" && "text-win")}>
          {rightPct}%
        </span>
      </div>
      <div className="text-[10px] text-muted mt-1">{total.toLocaleString()} vote{total === 1 ? "" : "s"}</div>
    </div>
  );
}
