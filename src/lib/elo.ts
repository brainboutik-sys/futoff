/**
 * Simple ELO. Symmetric, deterministic, zero-sum.
 *
 * K lowers slightly after a card has played many matches — so early ratings move
 * fast, and settled cards don't thrash around under weight of new votes.
 */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function kFactor(matchesPlayed: number): number {
  if (matchesPlayed < 30) return 32;
  if (matchesPlayed < 100) return 24;
  return 16;
}

/** Returns both new ratings given `aWon` (true means card A was chosen). */
export function updateRatings(
  ratingA: number,
  ratingB: number,
  aMatches: number,
  bMatches: number,
  aWon: boolean,
): { newA: number; newB: number } {
  const Ea = expectedScore(ratingA, ratingB);
  const Eb = 1 - Ea;
  const Sa = aWon ? 1 : 0;
  const Sb = 1 - Sa;
  const Ka = kFactor(aMatches);
  const Kb = kFactor(bMatches);
  return {
    newA: Math.round(ratingA + Ka * (Sa - Ea)),
    newB: Math.round(ratingB + Kb * (Sb - Eb)),
  };
}
