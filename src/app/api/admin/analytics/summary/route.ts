import { Effect } from 'effect';
import { requireAdminRoute, runEffect, respond } from '@/composition';
import { getAnalyticsSummary } from '@app/application';

export async function GET() {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  return runEffect(
    Effect.gen(function* () {
      const result = yield* getAnalyticsSummary();
      return Response.json(result);
    }).pipe(Effect.catchAll((e) => Effect.succeed(respond(e)))),
  );
}
