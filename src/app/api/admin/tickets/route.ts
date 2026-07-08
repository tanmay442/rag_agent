import { Effect } from 'effect';
import { requireAdminGet, isTicketStatus, parseQueryPagination, runEffect, respond } from '@/composition';
import { listTickets } from '@app/application';

export async function GET(req: Request) {
  const auth = await requireAdminGet(req);
  if (!auth.ok) return auth.response;
  const { url } = auth;
  const status = url.searchParams.get('status');
  const assignee = url.searchParams.get('assignee');
  const search = url.searchParams.get('search') ?? undefined;
  const { limit, offset } = parseQueryPagination(url);
  return runEffect(
    Effect.gen(function* () {
      const result = yield* listTickets({
        status: status && isTicketStatus(status) ? status : undefined,
        assignee: assignee || undefined,
        search,
        limit,
        offset,
      });
      return Response.json(result);
    }).pipe(Effect.catchAll((e) => Effect.succeed(respond(e)))),
  );
}
