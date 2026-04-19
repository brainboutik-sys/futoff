import Link from "next/link";

export function Header() {
  return (
    <header className="h-16 border-b border-line/80 backdrop-blur bg-bg/60 sticky top-0 z-20">
      <div className="mx-auto max-w-6xl h-full px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(34,211,238,0.8)] group-hover:scale-125 transition" />
          <span className="text-lg font-black tracking-tight">
            FUT<span className="text-accent">OFF</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-white/5">Play</Link>
          <Link href="/bracket/daily" className="px-3 py-1.5 rounded-md hover:bg-white/5">
            Bracket
            <span className="ml-1.5 text-[10px] text-accent/80 align-top">NEW</span>
          </Link>
          <Link href="/rankings" className="px-3 py-1.5 rounded-md hover:bg-white/5">Rankings</Link>
          <Link href="/about" className="px-3 py-1.5 rounded-md hover:bg-white/5 hidden sm:inline">About</Link>
        </nav>
      </div>
    </header>
  );
}
