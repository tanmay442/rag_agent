import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { restoreDocument } from '@/lib/admin/documents';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let session;
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
  const result = await restoreDocument(docId, session.user.id);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 410;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
