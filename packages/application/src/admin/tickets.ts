// Admin ticket use-cases. Source: src/lib/admin/tickets.ts.
import { ok, type Result } from '@app/domain';
import type { TicketRepository, AuditLog, TicketRow } from '../ports/index';

export const TICKET_STATUSES = ['created', 'in_progress', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

const VALID_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  created: ['in_progress', 'closed'],
  in_progress: ['closed', 'created'],
  closed: [],
};

export async function listTickets(
  input: {
    status?: TicketStatus;
    assignee?: string | null;
    search?: string;
    limit?: number;
    offset?: number;
  },
  deps: { tickets: TicketRepository },
): Promise<Result<{ tickets: TicketRow[]; total: number }>> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const r = await deps.tickets.list({
    status: input.status,
    assignee: input.assignee,
    search: input.search,
    limit,
    offset,
  });
  return ok({ tickets: r.rows, total: r.total });
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
  ticket?: unknown;
}

export async function updateTicket(
  input: UpdateTicketInput,
  deps: { tickets: TicketRepository; audit: AuditLog },
): Promise<Result<UpdateTicketResult>> {
  const existing = await deps.tickets.findByTicketId(input.ticketId);
  if (!existing) return ok({ ok: false, reason: 'not_found' });
  if (input.status && !VALID_TRANSITIONS[existing.status as TicketStatus].includes(input.status)) {
    return ok({ ok: false, reason: 'invalid_transition' });
  }
  const patch: Partial<{ status: string; assignedTo: string | null; notes: string }> = {};
  if (input.status) patch.status = input.status;
  if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
  if (input.note) {
    patch.notes = existing.notes ? `${existing.notes}\n\n${input.note}` : input.note;
  }
  const updated = await deps.tickets.update(input.ticketId, patch);
  if (!updated) return ok({ ok: false, reason: 'not_found' });
  await deps.audit.logTicketEvent({
    action: 'status_change',
    ticketId: input.ticketId,
    actorId: input.actorId,
  });
  return ok({ ok: true, ticket: updated });
}
