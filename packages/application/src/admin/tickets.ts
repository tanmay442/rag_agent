import { Effect } from 'effect';
import {
  Tickets,
  Audit,
  NotFoundError,
  ConflictError,
  type TicketRow,
} from '@app/domain';
import { randomUUID } from 'node:crypto';
import { MAX_TICKET_NOTES_LENGTH, MAX_LIST_LIMIT } from '../../../../config/constants';
import { sanitizePagination } from '../pagination';

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

export const listTickets = Effect.fn('Admin.listTickets')(
  function* (input: {
    status?: TicketStatus;
    assignee?: string | null;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const tickets = yield* Tickets;
    const { limit, offset } = sanitizePagination(input.limit, input.offset, MAX_LIST_LIMIT);
    const r = yield* tickets.list({
      status: input.status,
      assignee: input.assignee,
      search: input.search,
      limit,
      offset,
    });
    return { tickets: r.rows, total: r.total };
  },
);

export interface UpdateTicketInput {
  ticketId: string;
  status?: TicketStatus;
  assignedTo?: string | null;
  note?: string;
  actorId: string;
}

export const updateTicket = Effect.fn('Admin.updateTicket')(
  function* (input: UpdateTicketInput) {
    const tickets = yield* Tickets;
    const audit = yield* Audit;
    const existing = yield* tickets.findByTicketId(input.ticketId);
    if (!existing) return yield* new NotFoundError('Ticket not found');
    if (
      input.status &&
      isTicketStatus(existing.status) &&
      !VALID_TRANSITIONS[existing.status].includes(input.status)
    ) {
      return yield* new ConflictError('Invalid status transition');
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
    const updated = yield* tickets.update(input.ticketId, patch);
    if (!updated) return yield* new NotFoundError('Ticket not found');
    const auditAction = input.status
      ? 'status_change'
      : input.assignedTo !== undefined
        ? 'assign'
        : 'note';
    // Audit is best-effort: a logging failure must not roll back the ticket update.
    yield* audit
      .logTicketEvent({ action: auditAction, ticketId: input.ticketId, actorId: input.actorId })
      .pipe(Effect.catchAll((e) => Effect.sync(() => console.error('Audit logging failed:', e))));
    return updated;
  },
);

export interface CreateTicketInput {
  userId: string;
  name: string;
  email: string;
  issue: string;
}

export const createTicket = Effect.fn('Admin.createTicket')(
  function* (input: CreateTicketInput) {
    const tickets = yield* Tickets;
    const audit = yield* Audit;
    const ticketId = `TKT-${randomUUID().slice(0, 8)}`;
    const row = yield* tickets.insert({
      ticketId,
      userId: input.userId,
      name: input.name,
      email: input.email,
      issue: input.issue,
    });
    yield* audit
      .logTicketEvent({ action: 'create', ticketId: row.ticketId, actorId: input.userId })
      .pipe(Effect.catchAll((e) => Effect.sync(() => console.error('Audit logging failed:', e))));
    return { ticketId: row.ticketId, status: 'created' as const };
  },
);
