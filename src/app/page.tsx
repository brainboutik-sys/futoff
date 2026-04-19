import { MatchupArena } from "@/components/MatchupArena";
import { generateMatchup } from "@/lib/matchup";
import { readSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Session cookie is guaranteed by middleware.
  const sessionId = await readSessionId();
  let opener = true;
  if (sessionId) {
    const stats = await prisma.userStats.findUnique({
      where: { sessionId },
      select: { totalVotes: true },
    });
    opener = !stats || stats.totalVotes === 0;
  }
  const initial = await generateMatchup({ opener, sessionId }).catch(() => null);
  return <MatchupArena initialMatchup={initial} />;
}
