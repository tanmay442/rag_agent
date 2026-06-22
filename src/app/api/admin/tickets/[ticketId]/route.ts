import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getComposition, requireAdmin, ForbiddenError, isTicketStatus, TICKET_STATUSES } from '@/composition';

const PatchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assignedTo: z.string().nullable().optional(),
  note: z.string().min(1).max(10_000).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  let session;
  const comp = getComposition();
  try { session = await requireAdmin(); } catch (err) {
    if (err instanceof ForbiddenError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    throw err;
  }
  const { ticketId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (parsed.data.status && !isTicketStatus(parsed.data.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const result = await comp.updateTicket({
    ticketId,
    status: parsed.data.status,
    assignedTo: parsed.data.assignedTo,
    note: parsed.data.note,
    actorId: session.user.id,
  });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ticket: result.ticket });
}
