import { forbidden } from 'next/navigation';
import { getSession } from '@/lib/auth/server';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') {
    forbidden();
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      {children}
    </div>
  );
}
