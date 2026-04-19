import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/share/[matchupId]
 *
 * Returns a 1200x630 SVG of the matchup (content-type: image/svg+xml).
 * SVG is supported by every OG scraper and social card renderer, and avoids
 * the @vercel/og font-loading bug that hits Windows dev paths with spaces.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ matchupId: string }> },
) {
  const { matchupId } = await ctx.params;
  const m = await prisma.matchup.findUnique({
    where: { id: matchupId },
    include: { leftCard: true, rightCard: true },
  });
  if (!m) return new Response("not found", { status: 404 });

  const labelText = (m.label ?? m.mode ?? "matchup").toUpperCase();
  const esc = (s: string) =>
    s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

  const side = (x: number, c: typeof m.leftCard) => `
    ${c.imageUrl ? `<image href="${esc(c.imageUrl)}" x="${x - 150}" y="120" width="300" height="300" preserveAspectRatio="xMidYMid meet" />` : ""}
    <text x="${x}" y="470" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="42" font-weight="900" fill="#e9edf5">${esc(c.displayName)}</text>
    <text x="${x}" y="528" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="58" font-weight="900" fill="#f5c44e">${c.overallRating}</text>
    <text x="${x}" y="560" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="20" fill="#8a93a6" letter-spacing="3">${esc(c.position)}</text>
    ${c.club ? `<text x="${x}" y="590" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" fill="#8a93a6">${esc(c.club)}</text>` : ""}
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07080c" />
      <stop offset="50%" stop-color="#0e1118" />
      <stop offset="100%" stop-color="#07080c" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="600" cy="315" r="150" fill="url(#glow)" />

  <circle cx="56" cy="56" r="7" fill="#22d3ee" />
  <text x="74" y="66" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="900" fill="#e9edf5">FUT<tspan fill="#22d3ee">OFF</tspan></text>

  <text x="600" y="95" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" fill="#8a93a6" letter-spacing="5">${esc(labelText)}</text>

  ${side(260, m.leftCard)}
  ${side(940, m.rightCard)}

  <text x="600" y="310" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="92" font-weight="900" fill="#22d3ee" letter-spacing="4">VS</text>
  <text x="600" y="355" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#8a93a6" letter-spacing="5">PICK ONE</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
