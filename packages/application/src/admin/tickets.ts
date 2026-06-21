// Admin ticket use-cases. Source: src/lib/admin/tickets.ts.
import { err, ok, type Result, NotFoundError, ValidationError } from '@app/domain';
import type { TicketRepository, AuditLog } from '../ports/index';

export const TICKET_STATUSES = ['created', 'in_progress', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

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
): Promise<Result<{ tickets: unknown[]; total: number }>> {
  // The legacy listTickets SQL is preserved in src/lib/admin/tickets.ts
  // until commit 6 lands the drizzle ticket repository.
  const { listTickets: legacyList } = await import('../../../../src/lib/admin/tickets.js');
  const r = await legacyList(input);
  return ok({ tickets: r.tickets, total: r.total });
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
  // Defer the actual write to the legacy SQL until commit 6.
  const { updateTicket: legacyUpdate } = await import('../../../../src/lib/admin/tickets.js');
  const r = await legacyUpdate(input);
  if (!r.ok) {
    if (r.reason === 'not_found') return ok({ ok: false, reason: 'not_found' });
    return ok({ ok: false, reason: 'invalid_transition' });
  }
  return ok({ ok: true, ticket: r.ticket });
}
