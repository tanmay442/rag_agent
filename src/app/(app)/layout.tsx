import { getAppSession } from '@/composition';
import { AppSidebar, type AppRole } from '@/components/app/AppSidebar';

/**
 * Authenticated app shell. Renders the unified responsive
 * sidebar (desktop fixed-left, mobile slide-in drawer) and
 * reserves `md:pl-64` so page content sits to the right of
 * the fixed sidebar. On mobile the top bar lives in the
 * sidebar component itself; page content starts directly
 * underneath it.
 *
 * The session is resolved here (server-side) and passed to
 * the client-side sidebar. Page-level guards (requireSession,
 * requireAdmin) still run inside each page subtree.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAppSession();
  const role: AppRole = (session?.user.role as AppRole | undefined) ?? 'user';

  return (
    <>
      <AppSidebar
        user={
          session
            ? {
                name: session.user.name,
                imageUrl: session.user.imageUrl,
              }
            : null
        }
        role={role}
      />
      <main
        className="flex min-h-0 flex-1 flex-col md:pl-64"
        data-testid="app-main"
      >
        {children}
      </main>
    </>
  );
}
