import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  Tickets,
  Audit,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  type TicketRow,
} from '@app/domain';
import { updateTicket, createTicket, VALID_TRANSITIONS, isTicketStatus } from '../tickets';
import { expectFailure, runWith, runExit } from '../../__tests__/effect-test-utils';

function ticket(over: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 1,
    ticketId: 'TKT-1001',
    userId: 'u',
    name: 'n',
    email: 'e',
    issue: 'i',
    status: 'created',
    createdAt: new Date(),
    assignedTo: null,
    notes: null,
    ...over,
  };
}

function makeLayers(overrides: {
  tickets?: Partial<Tickets.Service>;
  audit?: Partial<Audit.Service>;
} = {}) {
  const tickets: Tickets.Service = {
    findByTicketId: vi.fn().mockReturnValue(Effect.succeed(null)),
    insert: vi.fn().mockReturnValue(Effect.succeed(ticket({ ticketId: 'TKT-12345678', status: 'created' }))),
    update: vi.fn().mockReturnValue(Effect.succeed(null)),
    list: vi.fn().mockReturnValue(Effect.succeed({ rows: [], total: 0 })),
    latest: vi.fn().mockReturnValue(Effect.succeed(null)),
    countAll: vi.fn().mockReturnValue(Effect.succeed(0)),
    countOpen: vi.fn().mockReturnValue(Effect.succeed(0)),
    ...overrides.tickets,
  };
  const audit: Audit.Service = {
    logTicketEvent: vi.fn().mockReturnValue(Effect.void),
    logDocumentEvent: vi.fn().mockReturnValue(Effect.void),
    list: vi.fn().mockReturnValue(Effect.succeed({ events: [], total: 0 })),
    ...overrides.audit,
  };
  return Layer.mergeAll(
    Layer.succeed(Tickets, tickets),
    Layer.succeed(Audit, audit),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('updateTicket', () => {
  it('returns NotFoundError for missing ticket', async () => {
    const layer = makeLayers();
    const exit = await runExit(
      updateTicket({ ticketId: 'TKT-MISSING', status: 'closed', actorId: 'user_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('returns ConflictError for invalid status transition', async () => {
    const layer = makeLayers({
      tickets: {
        findByTicketId: vi.fn().mockReturnValue(Effect.succeed(ticket({ status: 'closed' }))),
      },
    });
    const exit = await runExit(
      updateTicket({ ticketId: 'TKT-1001', status: 'created', actorId: 'user_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(ConflictError);
  });

  it('returns NotFoundError when update returns null (race condition)', async () => {
    const layer = makeLayers({
      tickets: {
        findByTicketId: vi.fn().mockReturnValue(Effect.succeed(ticket({ status: 'created' }))),
        update: vi.fn().mockReturnValue(Effect.succeed(null)),
      },
    });
    const exit = await runExit(
      updateTicket({ ticketId: 'TKT-1001', status: 'in_progress', actorId: 'user_1' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('updates notes without status change', async () => {
    const existing = ticket({ status: 'created', notes: 'old note' });
    const updated = ticket({ status: 'created', notes: 'new note' });
    const layer = makeLayers({
      tickets: {
        findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
        update: vi.fn().mockReturnValue(Effect.succeed(updated)),
      },
    });
    const result = await runWith(
      updateTicket({ ticketId: 'TKT-1001', note: 'new note', actorId: 'user_1' }),
      layer,
    );
    expect(result).toEqual(updated);
  });

  it('allows valid transition: created -> in_progress', async () => {
    const existing = ticket({ status: 'created' });
    const updated = ticket({ status: 'in_progress' });
    const layer = makeLayers({
      tickets: {
        findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
        update: vi.fn().mockReturnValue(Effect.succeed(updated)),
      },
    });
    await runWith(
      updateTicket({ ticketId: 'TKT-1001', status: 'in_progress', actorId: 'user_1' }),
      layer,
    );
  });

  it('allows valid transition: created -> closed', async () => {
    const existing = ticket({ status: 'created' });
    const updated = ticket({ status: 'closed' });
    const layer = makeLayers({
      tickets: {
        findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
        update: vi.fn().mockReturnValue(Effect.succeed(updated)),
      },
    });
    await runWith(
      updateTicket({ ticketId: 'TKT-1001', status: 'closed', actorId: 'user_1' }),
      layer,
    );
  });
});

describe('createTicket', () => {
  it('creates a ticket with generated ID', async () => {
    const layer = makeLayers();
    const result = await runWith(
      createTicket({ userId: 'user_1', name: 'Test', email: 't@x.com', issue: 'help' }),
      layer,
    );
    expect(result.ticketId).toMatch(/^TKT-[a-f0-9]{8}$/);
    expect(result.status).toBe('created');
  });

  it('logs audit with create action', async () => {
    const logTicketEvent = vi.fn().mockReturnValue(Effect.void);
    const layer = makeLayers({ audit: { logTicketEvent } });
    await runWith(
      createTicket({ userId: 'user_1', name: 'Test', email: 't@x.com', issue: 'help' }),
      layer,
    );
    expect(logTicketEvent).toHaveBeenCalledWith({
      action: 'create',
      ticketId: 'TKT-12345678',
      actorId: 'user_1',
    });
  });

  it('returns ExternalServiceError when insert fails', async () => {
    const layer = makeLayers({
      tickets: {
        insert: vi.fn().mockReturnValue(Effect.fail(new ExternalServiceError('DB down'))),
      },
    });
    const exit = await runExit(
      createTicket({ userId: 'user_1', name: 'Test', email: 't@x.com', issue: 'help' }),
      layer,
    );
    const err = expectFailure(exit);
    expect(err.code).toBe('external_service');
  });
});

describe('isTicketStatus', () => {
  it('returns true for valid statuses', () => {
    expect(isTicketStatus('created')).toBe(true);
    expect(isTicketStatus('in_progress')).toBe(true);
    expect(isTicketStatus('closed')).toBe(true);
  });

  it('returns false for invalid statuses', () => {
    expect(isTicketStatus('bogus')).toBe(false);
    expect(isTicketStatus('open')).toBe(false);
    expect(isTicketStatus('')).toBe(false);
  });
});

describe('VALID_TRANSITIONS', () => {
  it('created can go to in_progress and closed', () => {
    expect(VALID_TRANSITIONS.created).toContain('in_progress');
    expect(VALID_TRANSITIONS.created).toContain('closed');
  });

  it('closed has no valid transitions', () => {
    expect(VALID_TRANSITIONS.closed).toHaveLength(0);
  });
});
