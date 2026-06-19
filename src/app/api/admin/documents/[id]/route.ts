import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { hardDeleteDocument } from '@/lib/admin/documents';

export async function DELETE(
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
  try {
    await hardDeleteDocument(docId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Delete failed' },
      { status: 500 },
    );
  }
}
