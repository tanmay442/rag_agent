import { NextResponse } from 'next/server';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';

export async function GET(req: Request) {
  const comp = getComposition();
  try { await requireAdmin(); } catch (err) {
      if (err instanceof ForbiddenError) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      throw err;
    }
  const url = new URL(req.url);
  const documentId = url.searchParams.get('documentId');
  const ticketId = url.searchParams.get('ticketId');
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const result = await comp.listAudit({
    documentId: documentId ? Number(documentId) : undefined,
    ticketId: ticketId ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json(result);
}
