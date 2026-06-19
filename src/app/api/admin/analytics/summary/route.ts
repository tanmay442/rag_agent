import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { getAnalyticsSummary } from '@/lib/admin/analytics';

export async function GET() {
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const summary = await getAnalyticsSummary();
  return NextResponse.json(summary);
}
