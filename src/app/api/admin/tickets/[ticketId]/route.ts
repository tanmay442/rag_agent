import { z } from 'zod';
import { requireAdminRoute, isTicketStatus, TICKET_STATUSES } from '@/composition';
import { respond } from '@/lib/http';
import { ValidationError, NotFoundError, ConflictError } from '@app/domain';

const PatchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assignedTo: z.string().nullable().optional(),
  note: z.string().min(1).max(10_000).optional(),
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return respond(new ValidationError('Invalid payload'));
  }
  if (parsed.data.status && !isTicketStatus(parsed.data.status)) {
    return respond(new ValidationError('Invalid status'));
  }
  const result = await comp.updateTicket({
    ticketId,
    status: parsed.data.status,
    assignedTo: parsed.data.assignedTo,
    note: parsed.data.note,
    actorId: session.user.id,
  });
  if (!result.ok) {
    return result.reason === 'not_found'
      ? respond(new NotFoundError('Ticket not found'))
      : respond(new ConflictError('Ticket update conflict'));
  }
  return respond({ ticket: result.ticket });
}
