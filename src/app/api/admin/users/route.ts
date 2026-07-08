import { Effect } from 'effect';
import { requireAdminGet, parseQueryPagination, runEffect, respond } from '@/composition';
import { listUsers } from '@app/application';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { url } = auth;
  const search = url.searchParams.get('search') ?? undefined;
  const { limit, offset } = parseQueryPagination(url);
  return runEffect(
    Effect.gen(function* () {
      const result = yield* listUsers({ search, limit, offset });
      return Response.json(result);
    }).pipe(Effect.catchAll((e) => Effect.succeed(respond(e)))),
  );
}
