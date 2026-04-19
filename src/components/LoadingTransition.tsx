export function LoadingTransition({ label = "Loading next matchup..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-muted text-sm">
      <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
      <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
      <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
      <span className="ml-2">{label}</span>
    </div>
  );
}
