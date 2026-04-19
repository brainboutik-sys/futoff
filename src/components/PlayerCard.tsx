"use client";
import type { PlayerCard as PlayerCardT } from "@prisma/client";
import { cn } from "@/lib/utils";

type Props = {
  card: PlayerCardT;
  onPick?: () => void;
  disabled?: boolean;
  highlight?: "win" | "loss" | null;
  pctLabel?: number | null;
  side?: "left" | "right";
};

/**
 * FUT-inspired card. Displays the 6 headline stats for outfield players
 * and GK-specific values (when present) for keepers.
 */
export function PlayerCard({ card, onPick, disabled, highlight, pctLabel, side }: Props) {
  const isGK = card.position === "GK" && card.gkDiving != null;
  const stats: [string, number][] = isGK
    ? [
        ["DIV", card.gkDiving ?? 0],
        ["HAN", card.gkHandling ?? 0],
        ["KIC", card.gkKicking ?? 0],
        ["REF", card.gkReflexes ?? 0],
        ["SPE", card.pace],
        ["POS", card.gkPositioning ?? 0],
      ]
    : [
        ["PAC", card.pace],
        ["SHO", card.shooting],
        ["PAS", card.passing],
        ["DRI", card.dribbling],
        ["DEF", card.defending],
        ["PHY", card.physical],
      ];

  const tier = cardTierStyle(card.overallRating);

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      aria-label={`Pick ${card.displayName}`}
      className={cn(
        "group relative w-full max-w-[340px] aspect-[3/4] rounded-3xl p-5 card-surface text-left",
        "transition-all duration-200 ease-out select-none",
        "hover:-translate-y-1 hover:shadow-glow focus-visible:outline-none focus-visible:shadow-glow",
        disabled && "cursor-default hover:translate-y-0 hover:shadow-card",
        highlight === "win" && "ring-2 ring-win shadow-[0_0_40px_rgba(52,211,153,0.35)]",
        highlight === "loss" && "opacity-60 saturate-50",
      )}
      style={{ borderColor: tier.border }}
    >
      {/* Tier bar */}
      <div
        className="absolute inset-x-5 top-0 h-1 rounded-b-full"
        style={{ background: tier.accent }}
      />

      {/* Header: OVR + Position */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center leading-none">
          <span className="text-5xl font-black tabular-nums" style={{ color: tier.accent }}>
            {card.overallRating}
          </span>
          <span className="text-[11px] tracking-widest text-muted mt-1">{card.position}</span>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-wider text-muted">
          {card.nation && <span>{card.nation}</span>}
          {card.club && <span className="max-w-[140px] truncate">{card.club}</span>}
          {card.league && <span className="opacity-60 max-w-[140px] truncate">{card.league}</span>}
        </div>
      </div>

      {/* Portrait */}
      <div className="relative mt-2 h-[46%] flex items-center justify-center">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.displayName}
            className="max-h-full w-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.55)]"
            loading="eager"
          />
        ) : (
          <div className="text-muted text-xs">no image</div>
        )}
        {side && !disabled && (
          <span className="absolute top-0 right-0 text-[10px] font-bold text-muted tracking-widest">
            {side === "left" ? "← A" : "B →"}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="mt-1 border-b border-white/10 pb-2">
        <div className="text-xl font-extrabold tracking-tight truncate">{card.displayName}</div>
        <div className="text-[11px] text-muted truncate">{card.playerName}</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-3 text-sm">
        {stats.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between">
            <span className="tabular-nums font-bold">{value}</span>
            <span className="text-[10px] text-muted tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* Vote % overlay */}
      {pctLabel != null && (
        <div
          className={cn(
            "absolute inset-x-5 bottom-5 rounded-xl px-3 py-2 text-center animate-slideUp",
            highlight === "win" ? "bg-win/20 text-win" : "bg-white/5 text-muted",
          )}
        >
          <span className="text-2xl font-black tabular-nums">{pctLabel}%</span>
          <span className="ml-2 text-[11px] uppercase tracking-widest">voted</span>
        </div>
      )}
    </button>
  );
}

function cardTierStyle(ovr: number): { accent: string; border: string } {
  if (ovr >= 90) return { accent: "#f5c44e", border: "rgba(245,196,78,0.4)" };
  if (ovr >= 85) return { accent: "#fcd34d", border: "rgba(252,211,77,0.3)" };
  if (ovr >= 75) return { accent: "#e5e7eb", border: "rgba(229,231,235,0.18)" };
  if (ovr >= 65) return { accent: "#a3a3a3", border: "rgba(163,163,163,0.2)" };
  return { accent: "#b98b5b", border: "rgba(185,139,91,0.25)" };
}
