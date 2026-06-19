import { NextResponse } from 'next/server';
import { requireAdmin, ForbiddenError } from '@/lib/auth/session';
import { listAudit } from '@/lib/admin/audit';

export async function GET(req: Request) {
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
  const result = await listAudit({
    documentId: documentId ? Number(documentId) : undefined,
    ticketId: ticketId ?? undefined,
    limit,
    offset,
  });
  return NextResponse.json(result);
}
