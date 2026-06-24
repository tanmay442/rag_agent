import { requireAdminGet, parseQueryPagination } from '@/composition';
import { respond } from '@/lib/http';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { comp, url } = auth;
  const search = url.searchParams.get('search') ?? undefined;
  const { limit, offset } = parseQueryPagination(url);
  const result = await comp.listUsers({ search, limit, offset });
  return respond(result);
}
