export default function AdminNotFound() {
  return (
    <section className="flex flex-col items-center gap-3 py-12" role="alert">
      <h2 className="text-xl font-medium text-[var(--foreground)]">Not found</h2>
      <p className="text-sm text-[var(--foreground-muted)]">
        The admin resource you&apos;re looking for doesn&apos;t exist.
      </p>
    </section>
  );
}
