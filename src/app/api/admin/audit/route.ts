import { requireAdminGet, parseQueryPagination, runComp, respond } from '@/composition';
import { ValidationError } from '@app/domain';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { comp, url } = auth;
  const documentIdRaw = url.searchParams.get('documentId');
  const ticketId = url.searchParams.get('ticketId');
  let documentId: number | undefined;
  if (documentIdRaw !== null) {
    const n = Number(documentIdRaw);
    if (!Number.isInteger(n)) return respond(new ValidationError('Invalid documentId'));
    documentId = n;
  }
  const { limit, offset } = parseQueryPagination(url, { limit: 50 });
  return runComp(
    comp.listAudit({ documentId, ticketId: ticketId ?? undefined, limit, offset }),
  );
}
