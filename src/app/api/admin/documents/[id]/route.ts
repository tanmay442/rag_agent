import { Effect } from 'effect';
import { requireAdminRoute, runEffect, respond } from '@/composition';
import { hardDeleteDocument } from '@app/application';
import { ValidationError } from '@app/domain';

export async function DELETE(
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
      yield* hardDeleteDocument({ documentId: docId, actorId: session.user.id });
      return Response.json({ ok: true });
    }).pipe(Effect.catchAll((e) => Effect.succeed(respond(e)))),
  );
}
