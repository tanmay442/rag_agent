import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { RoleToggle } from './RoleToggle';

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | null;
}

async function listUsers(): Promise<AdminUserRow[]> {
  // Read directly from the Better Auth table. The schema is private but
  // the column shape is stable enough for our purposes.
  const res = await db.execute(
    sql`SELECT id, email, name, role FROM neon_auth.user ORDER BY created_at DESC NULLS LAST LIMIT 100`,
  );
  return (res as unknown as { rows?: AdminUserRow[] }).rows ?? [];
}

export default async function AdminUsersPage() {
  const users = await listUsers();
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Users</h2>
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2">{u.role ?? 'user'}</td>
                  <td className="px-3 py-2">
                    <RoleToggle
                      userId={u.id}
                      currentRole={u.role ?? 'user'}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
