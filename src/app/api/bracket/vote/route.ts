import { NextResponse } from "next/server";
import { voteBracketMatch } from "@/lib/bracket";
import { getOrCreateSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessionId = await getOrCreateSessionId();
  const body = (await req.json().catch(() => null)) as
    | { matchId?: string; chosenCardId?: number }
    | null;
  if (!body?.matchId || !body.chosenCardId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    await voteBracketMatch(body.matchId, body.chosenCardId, sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "already_voted" ? 409
      : message === "match_closed" ? 410
      : message === "match_not_found" ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
