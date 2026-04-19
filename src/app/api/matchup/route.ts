import { NextResponse } from "next/server";
import { generateMatchup, type Mode } from "@/lib/matchup";
import { getOrCreateSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_MODES: Mode[] = [
  "rivalry",
  "same-level",
  "goat",
  "meta",
  "club",
  "wildcard",
  "featured",
  "random",
];

export async function GET(req: Request) {
  const sessionId = await getOrCreateSessionId();
  const url = new URL(req.url);

  const modeParam = url.searchParams.get("mode");
  const mode = modeParam && (VALID_MODES as string[]).includes(modeParam) ? (modeParam as Mode) : undefined;
  const recent = (url.searchParams.get("recent") ?? "")
    .split(",")
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isFinite(n));

  // Opener: caller can force it, otherwise we infer from "never voted before."
  let opener = url.searchParams.get("opener") === "1";
  if (!opener && !mode) {
    const stats = await prisma.userStats.findUnique({
      where: { sessionId },
      select: { totalVotes: true },
    });
    if (!stats || stats.totalVotes === 0) opener = true;
  }

  const matchup = await generateMatchup({ mode, opener, recentCardIds: recent, sessionId });
  if (!matchup) {
    return NextResponse.json(
      { error: "no_data", message: "Couldn't build a matchup for this mode." },
      { status: 503 },
    );
  }
  return NextResponse.json(matchup);
}
