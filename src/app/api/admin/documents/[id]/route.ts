import { requireAdminRoute } from '@/composition';
import { respond } from '@/lib/http';
import { ValidationError } from '@app/domain';

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
  const { id } = await context.params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return respond(new ValidationError('Invalid id'));
  }
  try {
    await comp.hardDeleteDocument({ documentId: docId, actorId: session.user.id });
    return respond({ ok: true });
  } catch (err) {
    return respond(err);
  }
}
