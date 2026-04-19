import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import type { PrismaClient } from "@prisma/client";

/**
 * FUTOFF data-import
 * -------------------
 * Source of truth: EAFC26 CSV shipped in _dataset_raw/ (the ZIP the user provided).
 * This module is the ONLY path player data enters the DB.
 *
 * Pipeline:
 *   readCsv(path) -> normalizeRow(raw) -> validate(card) -> upsertMany(prisma, cards)
 *
 * Idempotency: upsert keyed on externalId (the EA ID column from the dataset).
 * Re-running the import refreshes stats/image for existing cards without duplicating rows.
 */

export type RawRow = Record<string, string>;

export interface PlayerCardInput {
  externalId: string;
  playerName: string;
  displayName: string;
  gender: string | null;
  club: string | null;
  nation: string | null;
  league: string | null;
  position: string;
  altPositions: string | null;
  overallRating: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  gkDiving: number | null;
  gkHandling: number | null;
  gkKicking: number | null;
  gkPositioning: number | null;
  gkReflexes: number | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  weakFoot: number | null;
  skillMoves: number | null;
  preferredFoot: string | null;
  playStyles: string | null;
  imageUrl: string | null;
  cardType: string;
  featured: boolean;
  source: string;
}

export interface ImportSummary {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string; sample?: string }[];
  durationMs: number;
}

/** Read CSV file as a stream of raw row objects (header-keyed). */
export async function readCsv(path: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const rows: RawRow[] = [];
    createReadStream(path)
      .pipe(
        parse({
          columns: true,
          bom: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          relax_column_count: true,
        }),
      )
      .on("data", (row: RawRow) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve(rows));
  });
}

const toInt = (v: string | undefined | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number.parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

const orNull = (v: string | undefined | null): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

/** Best-effort display name — use last token if name is long, else full. */
const shortDisplay = (full: string): string => {
  const clean = full.trim();
  if (clean.length <= 18) return clean;
  const parts = clean.split(/\s+/);
  if (parts.length <= 1) return clean;
  return parts[parts.length - 1];
};

/** Classify card type. Dataset doesn't explicitly mark icons — heuristic on image/age/rating. */
const classifyCardType = (overall: number): string => {
  if (overall >= 90) return "hero";
  if (overall >= 85) return "gold-rare";
  if (overall >= 75) return "gold";
  if (overall >= 65) return "silver";
  return "bronze";
};

/**
 * Normalize a raw CSV row into our internal schema.
 * Returns null when the row is unusable (no ID, no name, or non-numeric overall).
 */
export function normalizeRow(raw: RawRow): PlayerCardInput | null {
  const externalId = orNull(raw["ID"]);
  const playerName = orNull(raw["Name"]);
  const overall = toInt(raw["OVR"]);
  const position = orNull(raw["Position"]);

  if (!externalId || !playerName || overall == null || !position) return null;

  // Six primary stats — for GKs the dataset still fills these with GK-flavoured values.
  const pace = toInt(raw["PAC"]) ?? 0;
  const shooting = toInt(raw["SHO"]) ?? 0;
  const passing = toInt(raw["PAS"]) ?? 0;
  const dribbling = toInt(raw["DRI"]) ?? 0;
  const defending = toInt(raw["DEF"]) ?? 0;
  const physical = toInt(raw["PHY"]) ?? 0;

  // Alt positions / play styles arrive as Python-style list strings like "['RW']".
  const parseListStr = (s: string | null): string | null => {
    if (!s) return null;
    try {
      const arr = s
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((x) => x.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      return arr.length ? JSON.stringify(arr) : null;
    } catch {
      return null;
    }
  };

  return {
    externalId,
    playerName,
    displayName: shortDisplay(playerName),
    gender: orNull(raw["GENDER"]),
    club: orNull(raw["Team"]),
    nation: orNull(raw["Nation"]),
    league: orNull(raw["League"]),
    position,
    altPositions: parseListStr(orNull(raw["Alternative positions"])),
    overallRating: overall,
    pace,
    shooting,
    passing,
    dribbling,
    defending,
    physical,
    gkDiving: toInt(raw["GK Diving"]),
    gkHandling: toInt(raw["GK Handling"]),
    gkKicking: toInt(raw["GK Kicking"]),
    gkPositioning: toInt(raw["GK Positioning"]),
    gkReflexes: toInt(raw["GK Reflexes"]),
    height: orNull(raw["Height"]),
    weight: orNull(raw["Weight"]),
    age: toInt(raw["Age"]),
    weakFoot: toInt(raw["Weak foot"]),
    skillMoves: toInt(raw["Skill moves"]),
    preferredFoot: orNull(raw["Preferred foot"]),
    playStyles: parseListStr(orNull(raw["play style"])),
    imageUrl: orNull(raw["card"]),
    cardType: classifyCardType(overall),
    featured: overall >= 90, // simple featured flag: OVR 90+
    source: "dataset",
  };
}

/** Validate required fields and plausible ranges. Return an error string or null. */
export function validate(card: PlayerCardInput): string | null {
  if (!card.externalId) return "missing externalId";
  if (!card.playerName) return "missing playerName";
  if (!card.position) return "missing position";
  if (card.overallRating < 30 || card.overallRating > 99) {
    return `implausible overall: ${card.overallRating}`;
  }
  return null;
}

/**
 * Bulk upsert cards. Idempotent by externalId.
 *
 * Strategy:
 *   - Fetch all existing externalIds up front.
 *   - Split input into "new" (createMany) and "existing" (per-row update).
 *   - createMany with skipDuplicates is one fast round-trip per batch.
 *   - Updates only run for rows that already exist, transactioned in batches.
 */
export async function upsertMany(
  prisma: PrismaClient,
  cards: PlayerCardInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; updated: number }> {
  const existing = await prisma.playerCard.findMany({ select: { externalId: true } });
  const existingSet = new Set(existing.map((e) => e.externalId));

  const toInsert: PlayerCardInput[] = [];
  const toUpdate: PlayerCardInput[] = [];
  for (const c of cards) {
    (existingSet.has(c.externalId) ? toUpdate : toInsert).push(c);
  }

  let done = 0;
  const total = cards.length;

  // 1. Bulk insert new rows — fast path.
  const INSERT_BATCH = 1000;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const slice = toInsert.slice(i, i + INSERT_BATCH);
    await prisma.playerCard.createMany({ data: slice, skipDuplicates: true });
    done += slice.length;
    onProgress?.(done, total);
  }

  // 2. Update existing rows — one transaction per batch.
  const UPDATE_BATCH = 200;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const slice = toUpdate.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      slice.map((c) =>
        prisma.playerCard.update({
          where: { externalId: c.externalId },
          data: {
            playerName: c.playerName,
            displayName: c.displayName,
            club: c.club,
            nation: c.nation,
            league: c.league,
            position: c.position,
            altPositions: c.altPositions,
            overallRating: c.overallRating,
            pace: c.pace,
            shooting: c.shooting,
            passing: c.passing,
            dribbling: c.dribbling,
            defending: c.defending,
            physical: c.physical,
            gkDiving: c.gkDiving,
            gkHandling: c.gkHandling,
            gkKicking: c.gkKicking,
            gkPositioning: c.gkPositioning,
            gkReflexes: c.gkReflexes,
            imageUrl: c.imageUrl,
            cardType: c.cardType,
            featured: c.featured,
            playStyles: c.playStyles,
          },
        }),
      ),
    );
    done += slice.length;
    onProgress?.(done, total);
  }

  return { inserted: toInsert.length, updated: toUpdate.length };
}

/** Full pipeline: CSV → normalize → validate → upsert. */
export async function runImport(
  prisma: PrismaClient,
  csvPath: string,
  opts: { reset?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<ImportSummary> {
  const started = Date.now();
  const errors: ImportSummary["errors"] = [];

  if (opts.reset) {
    // Order matters — votes → matchups → cards.
    await prisma.vote.deleteMany();
    await prisma.matchup.deleteMany();
    await prisma.playerCard.deleteMany();
  }

  const raw = await readCsv(csvPath);
  const cards: PlayerCardInput[] = [];
  const seen = new Set<string>();

  raw.forEach((row, idx) => {
    const card = normalizeRow(row);
    if (!card) {
      errors.push({ row: idx + 2, reason: "normalize failed", sample: row["Name"] });
      return;
    }
    const bad = validate(card);
    if (bad) {
      errors.push({ row: idx + 2, reason: bad, sample: card.playerName });
      return;
    }
    if (seen.has(card.externalId)) {
      // Dataset sometimes repeats an ID across men/women combined file — keep first occurrence.
      return;
    }
    seen.add(card.externalId);
    cards.push(card);
  });

  const { inserted, updated } = await upsertMany(prisma, cards, opts.onProgress);

  return {
    totalRows: raw.length,
    inserted,
    updated,
    skipped: raw.length - cards.length,
    errors,
    durationMs: Date.now() - started,
  };
}
