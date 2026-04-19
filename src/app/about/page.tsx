export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-black tracking-tight">
        FUT<span className="text-accent">OFF</span>
      </h1>
      <p className="mt-4 text-lg text-muted leading-relaxed">
        Two football cards. One choice. Instant next matchup. That&apos;s it.
      </p>

      <section className="mt-10 space-y-6 text-sm leading-relaxed text-ink/90">
        <div>
          <h2 className="text-xs tracking-[0.2em] text-muted uppercase">The loop</h2>
          <p className="mt-1">
            Every session is a stream of matchups between real EA FC 26 players,
            paired by position and rating to make every vote non-trivial. You pick, you see how the crowd voted, you go again.
          </p>
        </div>

        <div>
          <h2 className="text-xs tracking-[0.2em] text-muted uppercase">The data</h2>
          <p className="mt-1">
            Every card here comes from the EAFC26 dataset — 17k+ player ratings, stats, and
            portrait art, imported cleanly and indexed for fast random matchmaking.
            No invented players, no API stitching.
          </p>
        </div>

        <div>
          <h2 className="text-xs tracking-[0.2em] text-muted uppercase">Coming soon</h2>
          <ul className="mt-1 list-disc list-inside space-y-1 text-muted">
            <li>ELO-style per-player ratings from head-to-head results</li>
            <li>Leaderboard filters: by position, league, nation</li>
            <li>Daily challenges and streak scoring</li>
            <li>Themed brackets (Ballon d&apos;Or shortlist, Icons, etc.)</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
