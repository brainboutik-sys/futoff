# FUTOFF

Fast, addictive football-card voting. Two real EA FC 26 player cards. You pick one. Next.

Built with Next.js 15 (App Router) · TypeScript · Tailwind · Prisma · SQLite (dev) / Postgres-ready.

---

## 1. Setup

```bash
# 1. Install deps
npm install          # or pnpm i / yarn

# 2. Env
cp .env.example .env

# 3. DB schema
npx prisma db push   # creates prisma/dev.db with the full schema

# 4. Import the dataset (see §2)
npm run import

# 5. Go
npm run dev
```

Open <http://localhost:3000>. You should see a matchup immediately.

---

## 2. Data import

The only source of player data is the CSV you dropped into `_dataset_raw/` (from the EAFC26 archive).

- `src/lib/data-import.ts` — CSV → normalize → validate → Prisma upsert.
- `scripts/import-data.ts` — CLI entry. Idempotent. Safe to re-run.

Commands:

```bash
npm run import                 # upsert dataset (safe to re-run; keyed on EA ID)
npm run reset                  # wipe votes, matchups, cards, then re-import
tsx scripts/import-data.ts --csv=_dataset_raw/EAFC26-Men.csv   # custom source
```

Example output:
```
[import] csv=.../_dataset_raw/EAFC26.csv  reset=false
[import] 10%  (1787/17874)
[import] 50%  (8937/17874)
[import] 100% (17874/17874)
[import] done
  rows in csv : 17874
  inserted    : 17874
  updated     : 0
  skipped     : 0
  errors      : 0
  duration    : 8.42s
```

### Field mapping

| CSV column            | PlayerCard field       |
| --------------------- | ---------------------- |
| `ID`                  | `externalId` (unique)  |
| `Name`                | `playerName`           |
| `Name` (shortened)    | `displayName`          |
| `OVR`                 | `overallRating`        |
| `PAC/SHO/PAS/DRI/DEF/PHY` | six stat columns   |
| `GK Diving/...`       | GK-specific columns    |
| `Position`            | `position`             |
| `Team` / `Nation` / `League` | club / nation / league |
| `card`                | `imageUrl`             |
| `Age` / `Height` / `Weight` / `Weak foot` / `Skill moves` / `Preferred foot` / `play style` | meta |

Cards with `OVR >= 90` are tagged `featured: true`. Card tier (`bronze` → `hero`) is derived from OVR.

### Idempotency

Upserts are keyed on `externalId`. Re-running `npm run import` refreshes stats & images without duplicating rows. Use `npm run reset` to wipe the DB clean and re-import.

---

## 3. Architecture

```
src/
  app/
    page.tsx                  # voting (SSR initial matchup, client arena)
    rankings/page.tsx         # Wilson-scored leaderboard
    about/page.tsx
    api/
      matchup/route.ts        # GET — generate & persist a fresh Matchup
      vote/route.ts           # POST — record Vote, return live split %
      rankings/route.ts       # GET — JSON leaderboard
    layout.tsx / globals.css
  components/
    Header.tsx
    PlayerCard.tsx            # FUT-style card (OVR, 6 stats, club/nation)
    MatchupArena.tsx          # vote loop + keyboard ← / → / A / D
    VoteResultOverlay.tsx
    LoadingTransition.tsx
  lib/
    prisma.ts                 # singleton client
    data-import.ts            # CSV → DB pipeline (unit-testable)
    matchup.ts                # position-bucketed, OVR-banded matchmaking
    session.ts                # anonymous cookie sessions
    utils.ts                  # cn() + wilsonScore()
prisma/
  schema.prisma               # PlayerCard / Matchup / Vote
scripts/
  import-data.ts              # CLI entry
_dataset_raw/
  EAFC26.csv                  # single source of truth (from provided ZIP)
```

### Matchup generation

1. Seed card: weighted toward higher OVR (~60% picks come from OVR ≥ 80 pool) for recognisable names.
2. Opponent: same position bucket (GK / DEF / MID / ATT), OVR within ±3. Band widens (3 → 5 → 8 → 15) if the bucket is sparse.
3. Side randomised so there's no left/right bias.
4. Matchup row is persisted so votes can reference it.
5. Client keeps a rolling ring-buffer of recent card IDs (30) and sends them via `?recent=` so the server avoids repeats.

### Session

Anonymous 1-year cookie set by `lib/session.ts`. Used to scope vote attribution without any login. No PII stored.

### Rankings

For each card: `wins = votes chosen`, `appearances = COUNT(votes on matchups where card is left or right)`, score = Wilson lower bound at 95% confidence. This weights small samples down and avoids "1 vote, 100% win rate" noise.

---

## 4. Switching to Postgres

1. In `prisma/schema.prisma`, change `provider = "sqlite"` → `provider = "postgresql"`.
2. Set `DATABASE_URL="postgresql://..."` in `.env`.
3. `npx prisma migrate dev --name init`
4. `npm run import`

The schema uses only portable scalar types — no sqlite-specific features.

---

## 5. Keyboard

| key                 | action      |
| ------------------- | ----------- |
| `←` or `A`          | pick left   |
| `→` or `D`          | pick right  |

---

## 6. Product insight

### Addiction mechanics (live)
- Zero-friction loop: no auth, no intro, no settings.
- Immediate feedback: vote split shown ~700ms before auto-advance.
- Streak counter on screen (session-local).

### Addiction mechanics (next)
- **ELO ratings** per card from head-to-head results → real rankings, not just vote count.
- **Streak rewards**: agree-with-majority streak unlocks a gold tier matchup.
- **Daily brackets**: 8 player knockout, resets daily.
- **Share card**: "I picked X over Y. What would you do?" OG image.

### Key metrics
- Votes / session
- Session length (seconds + vote count)
- Return rate (D1, D7) — cookie-based
- P(next vote | just voted) — the loop tightness

### Risks
- **Repetition** at the high end — only ~100 cards are OVR ≥ 90. Mitigated by band widening + recent-buffer.
- **EA image hotlinking** — images served from `ratings-images-prod.pulse.ea.com`. Long-term, mirror to our own bucket.
- **Bot votes** — no rate limiting in MVP. Add per-session and per-IP throttles before launch.

---

## 7. Scripts

| script              | what it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Next dev server                      |
| `npm run build`     | `prisma generate` + `next build`     |
| `npm run start`     | production server                    |
| `npm run import`    | import/upsert dataset                |
| `npm run reset`     | wipe DB then re-import               |
| `npm run db:push`   | sync Prisma schema to DB             |
| `npm run db:studio` | open Prisma Studio                   |

---

## 8. License / data

Player data © EA Sports, sourced from the user-provided EAFC26 dataset. This project is a fan voting MVP, not affiliated with EA.
