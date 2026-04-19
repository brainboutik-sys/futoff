#!/usr/bin/env tsx
/**
 * CLI entry for FUTOFF data import.
 *
 *   pnpm import             # upsert dataset (idempotent)
 *   pnpm reset              # wipe DB then re-import
 *   tsx scripts/import-data.ts --csv=path/to/other.csv
 *
 * Dataset path defaults to $DATASET_CSV or _dataset_raw/EAFC26.csv.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import { runImport } from "../src/lib/data-import";

function parseArgs(argv: string[]) {
  const args = { reset: false, csv: process.env.DATASET_CSV || "_dataset_raw/EAFC26.csv" };
  for (const a of argv.slice(2)) {
    if (a === "--reset") args.reset = true;
    else if (a.startsWith("--csv=")) args.csv = a.slice("--csv=".length);
  }
  return args;
}

async function main() {
  const { reset, csv } = parseArgs(process.argv);
  const csvPath = path.resolve(process.cwd(), csv);

  if (!existsSync(csvPath)) {
    console.error(`[import] dataset not found at ${csvPath}`);
    console.error(`         place the CSV there or set DATASET_CSV in .env`);
    process.exit(1);
  }

  // Prefer DIRECT_URL (5432, no pgbouncer) for bulk writes — faster and avoids pooler
  // prepared-statement issues. Falls back to DATABASE_URL for local SQLite setups.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  console.log(`[import] csv=${csvPath}  reset=${reset}  via=${url?.includes("pooler") ? "pooler" : "direct"}`);
  const prisma = new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
  });
  try {
    let lastPct = -1;
    const summary = await runImport(prisma, csvPath, {
      reset,
      onProgress: (done, total) => {
        const pct = Math.floor((done / total) * 100);
        if (pct !== lastPct && pct % 10 === 0) {
          lastPct = pct;
          console.log(`[import] ${pct}%  (${done}/${total})`);
        }
      },
    });

    console.log("\n[import] done");
    console.log(`  rows in csv : ${summary.totalRows}`);
    console.log(`  inserted    : ${summary.inserted}`);
    console.log(`  updated     : ${summary.updated}`);
    console.log(`  skipped     : ${summary.skipped}`);
    console.log(`  errors      : ${summary.errors.length}`);
    console.log(`  duration    : ${(summary.durationMs / 1000).toFixed(2)}s`);
    if (summary.errors.length) {
      console.log("\n  first 5 errors:");
      for (const e of summary.errors.slice(0, 5)) {
        console.log(`    row ${e.row}: ${e.reason}${e.sample ? `  (${e.sample})` : ""}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
