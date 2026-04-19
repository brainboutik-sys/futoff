import { NextResponse } from "next/server";
import { getOrCreateDaily } from "@/lib/bracket";
import { getOrCreateSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await getOrCreateSessionId();
  try {
    const bracket = await getOrCreateDaily();
    return NextResponse.json(bracket);
  } catch (e) {
    return NextResponse.json(
      { error: "bracket_unavailable", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
