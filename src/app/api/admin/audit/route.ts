import { requireAdminGet, parseQueryPagination } from '@/composition';
import { respond } from '@/lib/http';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { comp, url } = auth;
  const documentId = url.searchParams.get('documentId');
  const ticketId = url.searchParams.get('ticketId');
  const { limit, offset } = parseQueryPagination(url, { limit: 50 });
  const result = await comp.listAudit({
    documentId: documentId ? Number(documentId) : undefined,
    ticketId: ticketId ?? undefined,
    limit,
    offset,
  });
  return respond(result);
}
