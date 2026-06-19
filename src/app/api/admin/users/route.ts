import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { listUsers } from '@/lib/auth/users';

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 25);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const result = await listUsers({ search, limit, offset });
  return NextResponse.json(result);
}
