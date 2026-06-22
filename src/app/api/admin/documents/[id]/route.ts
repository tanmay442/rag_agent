import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';

export async function DELETE(
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
  try {
    await comp.hardDeleteDocument({ documentId: docId, actorId: session.user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Delete failed' },
      { status: 500 },
    );
  }
}
