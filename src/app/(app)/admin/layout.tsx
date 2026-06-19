import { requireAdmin } from '@/lib/auth/session';

/**
 * Admin subtree layout. The sidebar/drawer chrome is provided
 * by the parent (app) layout; this layout is just the role
 * guard + page content frame. Non-admins never reach the
 * child page render.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 md:py-10"
      data-testid="admin-content"
    >
      {children}
    </div>
  );
}
