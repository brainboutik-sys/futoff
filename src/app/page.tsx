import { MatchupArena } from "@/components/MatchupArena";
import { generateMatchup } from "@/lib/matchup";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Session cookie is guaranteed by middleware — we just render.
  const initial = await generateMatchup().catch(() => null);
  return <MatchupArena initialMatchup={initial} />;
}
