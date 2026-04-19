import { NextResponse } from "next/server";
import { generateMatchup } from "@/lib/matchup";
import { getOrCreateSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await getOrCreateSessionId();

  // Client forwards recently-seen card IDs so we can avoid repeats.
  const url = new URL(req.url);
  const recent = (url.searchParams.get("recent") ?? "")
    .split(",")
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isFinite(n));

  const matchup = await generateMatchup(recent);
  if (!matchup) {
    return NextResponse.json(
      { error: "no_data", message: "No player cards in DB. Run `pnpm import`." },
      { status: 503 },
    );
  }
  return NextResponse.json(matchup);
}
