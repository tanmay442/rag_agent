import { requireAdminGet, parseQueryPagination, runComp } from '@/composition';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { comp, url } = auth;
  const search = url.searchParams.get('search') ?? undefined;
  const { limit, offset } = parseQueryPagination(url);
  return runComp(comp.listUsers({ search, limit, offset }));
}
