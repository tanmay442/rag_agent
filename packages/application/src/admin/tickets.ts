import {
  err,
  ok,
  type Result,
  ExternalServiceError,
  NotFoundError,
  ConflictError,
} from '@app/domain';
import type { TicketRepository, AuditLog, TicketRow } from '../ports/index';
import { randomUUID } from 'node:crypto';
import { MAX_TICKET_NOTES_LENGTH, MAX_LIST_LIMIT } from '../../../../config/constants';

export const TICKET_STATUSES = ['created', 'in_progress', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export const VALID_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
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
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 25), 1), MAX_LIST_LIMIT);
    const offset = Math.max(Math.floor(input.offset ?? 0), 0);
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

export async function updateTicket(
  input: UpdateTicketInput,
  deps: { tickets: TicketRepository; audit: AuditLog },
): Promise<Result<TicketRow>> {
  try {
    const existing = await deps.tickets.findByTicketId(input.ticketId);
    if (!existing) return err(new NotFoundError('Ticket not found'));
    if (
      input.status &&
      isTicketStatus(existing.status) &&
      !VALID_TRANSITIONS[existing.status].includes(input.status)
    ) {
      return err(new ConflictError('Invalid status transition'));
    }
    const patch: Partial<Pick<TicketRow, 'status' | 'assignedTo' | 'notes'>> = {};
    if (input.status) patch.status = input.status;
    if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
    if (input.note) {
      const newNotes = existing.notes
        ? (existing.notes + '\n' + input.note).slice(-MAX_TICKET_NOTES_LENGTH)
        : input.note;
      patch.notes = newNotes;
    }
    const updated = await deps.tickets.update(input.ticketId, patch);
    if (!updated) return err(new NotFoundError('Ticket not found'));
    const auditAction = input.status
      ? 'status_change'
      : input.assignedTo !== undefined
        ? 'assign'
        : 'note';
    void deps.audit
      .logTicketEvent({
        action: auditAction,
        ticketId: input.ticketId,
        actorId: input.actorId,
      })
      .catch((auditErr) => {
        console.error('Audit logging failed:', auditErr);
      });
    return ok(updated);
  } catch (e) {
    return err(new ExternalServiceError('Failed to update ticket', e));
  }
}

export interface CreateTicketInput {
  userId: string;
  name: string;
  email: string;
  issue: string;
}

export async function createTicket(
  input: CreateTicketInput,
  deps: { tickets: TicketRepository; audit: AuditLog },
): Promise<Result<{ ticketId: string; status: 'created' }>> {
  try {
    const ticketId = `TKT-${randomUUID().slice(0, 8)}`;
    const row = await deps.tickets.insert({
      ticketId,
      userId: input.userId,
      name: input.name,
      email: input.email,
      issue: input.issue,
    });
    void deps.audit
      .logTicketEvent({
        action: 'create',
        ticketId: row.ticketId,
        actorId: input.userId,
      })
      .catch((auditErr) => {
        console.error('Audit logging failed:', auditErr);
      });
    return ok({ ticketId: row.ticketId, status: 'created' as const });
  } catch (e) {
    return err(new ExternalServiceError('Failed to create ticket', e));
  }
}
