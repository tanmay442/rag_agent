import 'server-only';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tickets } from '@/lib/db/schema';
import { logTicketEvent } from '@/lib/auth/audit';
import type { Ticket } from '@/lib/db/schema';

export const TICKET_STATUSES = ['created', 'in_progress', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export interface ListTicketsParams {
  status?: TicketStatus;
  assignee?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListTicketsResult {
  tickets: Ticket[];
  total: number;
}

export async function listTickets(
  params: ListTicketsParams = {},
): Promise<ListTicketsResult> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim();
  const whereParts = [] as ReturnType<typeof eq>[];
  if (params.status) whereParts.push(eq(tickets.status, params.status));
  if (params.assignee !== undefined && params.assignee !== null) {
    whereParts.push(eq(tickets.assignedTo, params.assignee));
  }
  if (search) {
    whereParts.push(ilike(tickets.issue, `%${search}%`));
  }
  const where = whereParts.length === 0
    ? undefined
    : whereParts.length === 1
      ? whereParts[0]
      : and(...whereParts);

  const rows = await db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(desc(tickets.createdAt))
    .limit(limit)
    .offset(offset);
  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(where);
  return {
    tickets: rows as Ticket[],
    total: totalRow[0]?.count ?? 0,
  };
}

export async function getTicket(ticketId: string): Promise<Ticket | null> {
  const row = await db.query.tickets.findFirst({
    where: eq(tickets.ticketId, ticketId),
  });
  return (row as Ticket | undefined) ?? null;
}

export interface UpdateTicketInput {
  ticketId: string;
  status?: TicketStatus;
  assignedTo?: string | null;
  note?: string;
  actorId: string;
}

export interface UpdateTicketResult {
  ok: boolean;
  reason?: 'not_found' | 'invalid_transition';
  ticket?: Ticket;
}

// Disallow transitioning from `closed` back to `created` or `in_progress`.
// Once closed, a ticket must stay closed.
function isValidStatusTransition(
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  if (from === 'closed') return false;
  return true;
}

export async function updateTicket(
  input: UpdateTicketInput,
): Promise<UpdateTicketResult> {
  const existing = await getTicket(input.ticketId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (input.status && !isValidStatusTransition(existing.status, input.status)) {
    return { ok: false, reason: 'invalid_transition' };
  }
  const patch: Partial<Ticket> = {};
  if (input.status) patch.status = input.status;
  if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
  if (input.note !== undefined) {
    patch.notes = existing.notes
      ? `${existing.notes}\n\n${input.note}`
      : input.note;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, ticket: existing };
  }
  const [updated] = await db
    .update(tickets)
    .set(patch)
    .where(eq(tickets.ticketId, input.ticketId))
    .returning();
  if (!updated) return { ok: false, reason: 'not_found' };
  // Audit each kind of change.
  if (input.status && input.status !== existing.status) {
    await logTicketEvent({
      action: 'status_change',
      ticketId: input.ticketId,
      actorId: input.actorId,
    });
  }
  if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
    await logTicketEvent({
      action: 'assign',
      ticketId: input.ticketId,
      actorId: input.actorId,
    });
  }
  if (input.note !== undefined && input.note.length > 0) {
    await logTicketEvent({
      action: 'note',
      ticketId: input.ticketId,
      actorId: input.actorId,
    });
  }
  return { ok: true, ticket: updated as Ticket };
}
