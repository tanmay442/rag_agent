import { Schema } from 'effect';
import { requireAdminRoute, TICKET_STATUSES, respond } from '@/composition';
import { ValidationError } from '@app/domain';

const PatchSchema = Schema.Struct({
  status: Schema.optional(Schema.Literal(...TICKET_STATUSES)),
  assignedTo: Schema.optional(Schema.NullOr(Schema.String)),
  note: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(10_000)),
  ),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAdminRoute();
  if (!auth.ok) return auth.response;
  const { session, comp } = auth;
  const { ticketId } = await context.params;
  const body = await req.json().catch(() => ({}));
  let parsed: Schema.Schema.Type<typeof PatchSchema>;
  try {
    parsed = Schema.decodeUnknownSync(PatchSchema)(body);
  } catch (e) {
    return respond(
      new ValidationError('Invalid payload', {
        issues: e instanceof Error ? e.message : String(e),
      }),
    );
  }
  try {
    const ticket = await comp.updateTicket({
      ticketId,
      status: parsed.status,
      assignedTo: parsed.assignedTo,
      note: parsed.note,
      actorId: session.user.id,
    });
    return Response.json({ ticket });
  } catch (e) {
    return respond(e);
  }
}
