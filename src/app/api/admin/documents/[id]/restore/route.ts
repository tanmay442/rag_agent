import { NextResponse } from 'next/server';
import { requireAdminRoute } from '@/composition';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
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
