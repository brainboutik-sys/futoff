import { NextResponse } from "next/server";
import { loadBracket } from "@/lib/bracket";
import { getOrCreateSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await getOrCreateSessionId();
  const { id } = await ctx.params;
  const bracket = await loadBracket(id);
  if (!bracket) {
    return NextResponse.json({ error: "bracket_not_found" }, { status: 404 });
  }
  return NextResponse.json(bracket);
}
