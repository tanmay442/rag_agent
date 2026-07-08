import { Effect } from 'effect';
import { requireAdminRoute, runEffect, respond } from '@/composition';
import { restoreDocument } from '@app/application';
import { ValidationError } from '@app/domain';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return respond(new ValidationError('Invalid id'));
  }
  return runEffect(
    Effect.gen(function* () {
      yield* restoreDocument(docId, session.user.id);
      return Response.json({ ok: true });
    }).pipe(Effect.catchAll((e) => Effect.succeed(respond(e)))),
  );
}
