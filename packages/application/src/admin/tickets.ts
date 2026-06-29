// Admin ticket use-cases. Source: src/lib/admin/tickets.ts.
import { err, ok, type Result, ExternalServiceError } from '@app/domain';
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
  try {
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
  } catch (e) {
    return err(new ExternalServiceError('Failed to list tickets', e));
  }
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
  try {
    const existing = await deps.tickets.findByTicketId(input.ticketId);
    if (!existing) return ok({ ok: false, reason: 'not_found' });
    if (input.status && isTicketStatus(existing.status) && !VALID_TRANSITIONS[existing.status].includes(input.status)) {
      return ok({ ok: false, reason: 'invalid_transition' });
    }
    const patch: Partial<Pick<TicketRow, 'status' | 'assignedTo' | 'notes'>> = {};
    if (input.status) patch.status = input.status;
    if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
    if (input.note) {
      const MAX_NOTES_LENGTH = 10000;
      const newNotes = existing.notes
        ? (existing.notes + '\n' + input.note).slice(-MAX_NOTES_LENGTH)
        : input.note;
      patch.notes = newNotes;
    }
    const updated = await deps.tickets.update(input.ticketId, patch);
    if (!updated) return ok({ ok: false, reason: 'not_found' });
    await deps.audit.logTicketEvent({
      action: 'status_change',
      ticketId: input.ticketId,
      actorId: input.actorId,
    });
    return ok({ ok: true, ticket: updated });
  } catch (e) {
    return err(new ExternalServiceError('Failed to update ticket', e));
  }
}
