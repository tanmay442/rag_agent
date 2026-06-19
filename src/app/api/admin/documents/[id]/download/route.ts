import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { getDocumentById } from '@/lib/admin/documents';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return new NextResponse('Invalid id', { status: 400 });
  }
  const doc = await getDocumentById(docId);
  if (!doc) return new NextResponse('Not found', { status: 404 });
  if (!doc.blob) {
    return new NextResponse('File unavailable', { status: 404 });
  }
  return new NextResponse(new Uint8Array(doc.blob), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${doc.fileName}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
