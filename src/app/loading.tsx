// Root layout loading — shows while the root layout resolves auth/data.
// Individual route groups provide their own loading.tsx with a
// domain-appropriate skeleton; this one is the fallback.
export default function RootLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[var(--background)]"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        <span className="text-sm text-[var(--foreground-muted)]">Loading…</span>
      </div>
    </div>
  );
}
