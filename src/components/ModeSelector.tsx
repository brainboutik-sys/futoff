"use client";
import { cn } from "@/lib/utils";

export type Mode =
  | "rivalry"
  | "same-level"
  | "goat"
  | "meta"
  | "club"
  | "wildcard"
  | "featured"
  | "random";

const MODES: { id: Mode | null; label: string; hint: string }[] = [
  { id: null,           label: "Auto",       hint: "mixed flavours" },
  { id: "rivalry",      label: "Rivalries",  hint: "El Clásico, etc." },
  { id: "same-level",   label: "Same-level", hint: "tight call" },
  { id: "goat",         label: "GOAT",       hint: "legends vs modern" },
  { id: "meta",         label: "Meta",       hint: "pace vs skill" },
  { id: "club",         label: "Inside club",hint: "inner debates" },
  { id: "wildcard",     label: "Wildcard",   hint: "odd match-ups" },
];

export function ModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: Mode | null;
  onChange: (m: Mode | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
      <div className="inline-flex items-center gap-1.5 min-w-full sm:min-w-0">
        {MODES.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id ?? "auto"}
              disabled={disabled}
              onClick={() => onChange(m.id)}
              title={m.hint}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition",
                active
                  ? "bg-accent text-bg border-accent shadow-[0_0_24px_rgba(34,211,238,0.35)]"
                  : "bg-white/5 text-muted border-line hover:bg-white/10 hover:text-ink",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
