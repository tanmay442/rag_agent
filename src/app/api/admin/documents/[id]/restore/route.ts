import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let session;
  const comp = getComposition();
  try { session = await requireAdmin(); } catch (err) {
    if (err instanceof ForbiddenError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    throw err;
  }
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const result = await comp.restoreDocument(docId, session.user.id);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 410;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
