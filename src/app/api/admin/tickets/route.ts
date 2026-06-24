import { requireAdminGet, isTicketStatus, parseQueryPagination } from '@/composition';
import { respond } from '@/lib/http';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { comp, url } = auth;
  const status = url.searchParams.get('status');
  const assignee = url.searchParams.get('assignee');
  const search = url.searchParams.get('search') ?? undefined;
  const { limit, offset } = parseQueryPagination(url);
  const result = await comp.listTickets({
    status: status && isTicketStatus(status) ? status : undefined,
    assignee: assignee === null ? undefined : assignee,
    search,
    limit,
    offset,
  });
  return respond(result);
}
