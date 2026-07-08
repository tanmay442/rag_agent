import { requireAdminRoute, respond, runCompVoid } from '@/composition';
import { ValidationError } from '@app/domain';

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
  return runCompVoid(comp.restoreDocument(docId, session.user.id));
}
