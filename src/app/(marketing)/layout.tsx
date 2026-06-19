/**
 * Marketing route group. The landing page composes its own
 * header, content, and footer inline; this layout is a
 * passthrough so future marketing pages (e.g. /pricing,
 * /changelog) can pick up shared chrome by simply adding
 * a page.tsx next to this file.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
