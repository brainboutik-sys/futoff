#!/usr/bin/env tsx
/**
 * Seed script for FUTOFF v2 additions:
 *   - 12 Icons (cardType='icon', imageUrl null)
 *   - 17 Rivalry pairs using dataset club names
 *   - 5 hand-curated Featured Matchups (Messi vs Ronaldo, etc.)
 *   - 1 themed bracket (Ballon d'Or 2025 shortlist)
 *
 * Idempotent: safe to re-run. Keyed on externalId (icons) or pair (rivalries, featured).
 *
 *   pnpm seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
  },
});

// --- Icons ------------------------------------------------------------------
// Plausible EA Icon-style stat lines; intentionally not tied to any specific
// year's release. Gives us something to compare against current players in
// the "Generational War" / GOAT mode.

const ICONS = [
  { externalId: "icon-pele",          playerName: "Pelé",              displayName: "Pelé",         position: "CAM", overallRating: 98, pace: 95, shooting: 96, passing: 93, dribbling: 96, defending: 60, physical: 76, nation: "Brazil" },
  { externalId: "icon-maradona",      playerName: "Diego Maradona",    displayName: "Maradona",     position: "CAM", overallRating: 97, pace: 89, shooting: 92, passing: 94, dribbling: 97, defending: 48, physical: 75, nation: "Argentina" },
  { externalId: "icon-zidane",        playerName: "Zinedine Zidane",   displayName: "Zidane",       position: "CAM", overallRating: 96, pace: 78, shooting: 88, passing: 94, dribbling: 95, defending: 64, physical: 86, nation: "France" },
  { externalId: "icon-r9",            playerName: "Ronaldo Nazário",   displayName: "R9",           position: "ST",  overallRating: 96, pace: 96, shooting: 95, passing: 82, dribbling: 95, defending: 40, physical: 84, nation: "Brazil" },
  { externalId: "icon-ronaldinho",    playerName: "Ronaldinho",        displayName: "Ronaldinho",   position: "CAM", overallRating: 94, pace: 86, shooting: 89, passing: 92, dribbling: 96, defending: 40, physical: 74, nation: "Brazil" },
  { externalId: "icon-henry",         playerName: "Thierry Henry",     displayName: "Henry",        position: "ST",  overallRating: 94, pace: 95, shooting: 92, passing: 82, dribbling: 93, defending: 46, physical: 77, nation: "France" },
  { externalId: "icon-cruyff",        playerName: "Johan Cruyff",      displayName: "Cruyff",       position: "CF",  overallRating: 94, pace: 89, shooting: 87, passing: 92, dribbling: 95, defending: 60, physical: 70, nation: "Netherlands" },
  { externalId: "icon-maldini",       playerName: "Paolo Maldini",     displayName: "Maldini",      position: "CB",  overallRating: 94, pace: 84, shooting: 60, passing: 80, dribbling: 82, defending: 95, physical: 89, nation: "Italy" },
  { externalId: "icon-beckenbauer",   playerName: "Franz Beckenbauer", displayName: "Beckenbauer",  position: "CB",  overallRating: 93, pace: 73, shooting: 74, passing: 88, dribbling: 84, defending: 93, physical: 86, nation: "Germany" },
  { externalId: "icon-best",          playerName: "George Best",       displayName: "Best",         position: "RW",  overallRating: 93, pace: 93, shooting: 87, passing: 83, dribbling: 95, defending: 36, physical: 66, nation: "Northern Ireland" },
  { externalId: "icon-baggio",        playerName: "Roberto Baggio",    displayName: "Baggio",       position: "CAM", overallRating: 92, pace: 78, shooting: 91, passing: 90, dribbling: 93, defending: 42, physical: 70, nation: "Italy" },
  { externalId: "icon-eusebio",       playerName: "Eusébio",           displayName: "Eusébio",      position: "ST",  overallRating: 92, pace: 92, shooting: 93, passing: 78, dribbling: 89, defending: 38, physical: 81, nation: "Portugal" },
];

// --- Rivalries -------------------------------------------------------------
// Club names must match the dataset exactly. (Spurs = Tottenham, Milano FC = Inter.)

const RIVALRIES: { clubA: string; clubB: string; label: string; priority: number }[] = [
  { clubA: "Real Madrid",          clubB: "FC Barcelona",         label: "El Clásico",              priority: 100 },
  { clubA: "Man Utd",              clubB: "Manchester City",      label: "Manchester Derby",        priority: 95 },
  { clubA: "Liverpool",            clubB: "Man Utd",              label: "North West Derby",        priority: 90 },
  { clubA: "Liverpool",            clubB: "Manchester City",      label: "Modern classic",          priority: 85 },
  { clubA: "Arsenal",              clubB: "Spurs",                label: "North London Derby",      priority: 85 },
  { clubA: "FC Bayern München",    clubB: "Borussia Dortmund",    label: "Der Klassiker",           priority: 85 },
  { clubA: "Milano FC",            clubB: "Juventus",             label: "Derby d'Italia",          priority: 80 },
  { clubA: "Celtic",               clubB: "Rangers",              label: "Old Firm",                priority: 80 },
  { clubA: "Atlético de Madrid",   clubB: "Real Madrid",          label: "Madrid Derby",            priority: 80 },
  { clubA: "AS Roma",              clubB: "Juventus",             label: "Giallorossi vs Bianconeri", priority: 75 },
  { clubA: "Chelsea",              clubB: "Arsenal",              label: "London rivalry",          priority: 75 },
  { clubA: "Chelsea",              clubB: "Spurs",                label: "West-North London",       priority: 70 },
  { clubA: "Paris SG",             clubB: "Marseille",            label: "Le Classique",            priority: 80 },
  { clubA: "SSC Napoli",           clubB: "Juventus",             label: "South vs North",          priority: 75 },
  { clubA: "Ajax",                 clubB: "Feyenoord",            label: "De Klassieker",           priority: 75 },
  { clubA: "FC Barcelona",         clubB: "Atlético de Madrid",   label: "Title contenders",        priority: 65 },
  { clubA: "Liverpool",            clubB: "Arsenal",              label: "Modern title race",       priority: 65 },
];

// --- Featured matchups (hand-curated "no-brainer hook" openers) -------------

const FEATURED: { leftName: string; rightName: string; label: string; priority: number }[] = [
  { leftName: "Lionel Messi",     rightName: "Cristiano Ronaldo", label: "The eternal debate",      priority: 100 },
  { leftName: "Kylian Mbappé",    rightName: "Erling Haaland",    label: "Who rules next?",         priority: 95 },
  { leftName: "Jude Bellingham",  rightName: "Phil Foden",        label: "Generation England",      priority: 85 },
  { leftName: "Vini Jr.",         rightName: "Lamine Yamal",      label: "Real vs Barça future",    priority: 85 },
  { leftName: "Kevin De Bruyne",  rightName: "Luka Modrić",       label: "Midfield maestros",       priority: 80 },
  { leftName: "Virgil van Dijk",  rightName: "Rúben Dias",        label: "Elite centre-backs",      priority: 75 },
  { leftName: "Thibaut Courtois", rightName: "Alisson",           label: "Best keeper alive",       priority: 75 },
];

// --- Themed bracket ---------------------------------------------------------

const THEMED_BRACKET = {
  id: "theme-ballondor-2025",
  title: "Ballon d'Or 2025 shortlist",
  seeds: [
    "Kylian Mbappé",
    "Vini Jr.",
    "Erling Haaland",
    "Jude Bellingham",
    "Mohamed Salah",
    "Lamine Yamal",
    "Harry Kane",
    "Rodri",
  ],
};

// --- Runner ----------------------------------------------------------------

async function seedIcons() {
  let inserted = 0;
  let skipped = 0;
  for (const icon of ICONS) {
    const existing = await prisma.playerCard.findUnique({
      where: { externalId: icon.externalId },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }
    const tags = ["icon"];
    if (icon.pace >= 90) tags.push("pace_monster");
    if (icon.dribbling >= 90) tags.push("skill_merchant");
    if (icon.physical >= 85) tags.push("tank");
    if (icon.shooting >= 88) tags.push("finisher");
    if (icon.passing >= 88) tags.push("playmaker");
    tags.push("goat_candidate");
    await prisma.playerCard.create({
      data: {
        externalId: icon.externalId,
        playerName: icon.playerName,
        displayName: icon.displayName,
        gender: "M",
        club: null,
        nation: icon.nation,
        league: "Icons",
        position: icon.position,
        overallRating: icon.overallRating,
        pace: icon.pace,
        shooting: icon.shooting,
        passing: icon.passing,
        dribbling: icon.dribbling,
        defending: icon.defending,
        physical: icon.physical,
        imageUrl: null,
        cardType: "icon",
        featured: true,
        source: "icons-seed",
        tags: JSON.stringify(tags),
      },
    });
    inserted++;
  }
  return { inserted, skipped };
}

async function seedRivalries() {
  let inserted = 0;
  let skipped = 0;
  for (const r of RIVALRIES) {
    try {
      await prisma.rivalry.create({ data: r });
      inserted++;
    } catch {
      // unique constraint — already exists
      skipped++;
    }
  }
  return { inserted, skipped };
}

async function seedFeatured() {
  let inserted = 0;
  let skipped = 0;
  let missing: string[] = [];
  for (const f of FEATURED) {
    const left = await prisma.playerCard.findFirst({ where: { playerName: f.leftName } });
    const right = await prisma.playerCard.findFirst({ where: { playerName: f.rightName } });
    if (!left || !right) {
      if (!left) missing.push(f.leftName);
      if (!right) missing.push(f.rightName);
      skipped++;
      continue;
    }
    // Dedupe: treat "same pair in either order" as already seeded.
    const existing = await prisma.matchup.findFirst({
      where: {
        featured: true,
        OR: [
          { leftCardId: left.id, rightCardId: right.id },
          { leftCardId: right.id, rightCardId: left.id },
        ],
      },
    });
    if (existing) { skipped++; continue; }
    await prisma.matchup.create({
      data: {
        leftCardId: left.id,
        rightCardId: right.id,
        category: "att",
        mode: "featured",
        featured: true,
        label: f.label,
        priority: f.priority,
      },
    });
    inserted++;
  }
  return { inserted, skipped, missing };
}

async function seedThemedBracket() {
  const { id, title, seeds } = THEMED_BRACKET;
  const existing = await prisma.bracket.findUnique({ where: { id } });
  if (existing) return { created: false };

  const cards = await Promise.all(
    seeds.map((name) => prisma.playerCard.findFirst({ where: { playerName: name } })),
  );
  if (cards.some((c) => !c)) {
    return { created: false, missing: seeds.filter((_, i) => !cards[i]) };
  }

  const { createBracket } = await import("../src/lib/bracket");
  await createBracket({
    id,
    title,
    kind: "theme",
    seedCards: cards as NonNullable<(typeof cards)[number]>[],
  });
  return { created: true };
}

async function main() {
  console.log("[seed] starting v2 seed...");
  const icons = await seedIcons();
  console.log(`[seed] icons    : +${icons.inserted} (${icons.skipped} existed)`);
  const rivalries = await seedRivalries();
  console.log(`[seed] rivalries: +${rivalries.inserted} (${rivalries.skipped} existed)`);
  const featured = await seedFeatured();
  console.log(`[seed] featured : +${featured.inserted} (${featured.skipped} existed/missing)`);
  if (featured.missing.length) {
    console.log(`[seed]   missing player names: ${featured.missing.slice(0, 10).join(", ")}`);
  }
  const bracket = await seedThemedBracket();
  console.log(`[seed] themed bracket: ${bracket.created ? "created" : "skipped (existed or missing seeds)"}`);
  if (bracket.missing) console.log(`[seed]   missing: ${bracket.missing.join(", ")}`);
  console.log("[seed] done");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
