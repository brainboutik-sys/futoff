import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Wilson lower-bound score for ranking by win-rate with confidence. */
export function wilsonScore(wins: number, total: number, z = 1.96): number {
  if (total === 0) return 0;
  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (centre - margin) / denom;
}
