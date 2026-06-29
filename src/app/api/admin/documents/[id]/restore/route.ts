import { requireAdminRoute } from '@/composition';
import { respond } from '@/lib/http';
import { ValidationError, NotFoundError, GoneError } from '@app/domain';

export async function POST(
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
  const result = await comp.restoreDocument(docId, session.user.id);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      return respond(new NotFoundError('Document not found'));
    }
    if (result.reason === 'not_soft_deleted') {
      return respond(new ValidationError('Document is not deleted'));
    }
    return respond(new GoneError('Restore window expired'));
  }
  return respond({ ok: true });
}
