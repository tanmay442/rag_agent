import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';

export async function GET() {
  const comp = getComposition();
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const summary = await comp.getAnalyticsSummary();
  return NextResponse.json(summary);
}
