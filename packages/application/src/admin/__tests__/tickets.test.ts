import { describe, it, expect, vi, beforeEach } from '@effect/vitest';
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
import { expectFailure } from '../../__tests__/effect-test-utils';

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
  it.effect('returns NotFoundError for missing ticket', () =>
    Effect.gen(function* () {
      const layer = makeLayers();
      const exit = yield* updateTicket({
        ticketId: 'TKT-MISSING',
        status: 'closed',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err).toBeInstanceOf(NotFoundError);
    }),
  );

  it.effect('returns ConflictError for invalid status transition', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        tickets: {
          findByTicketId: vi.fn().mockReturnValue(Effect.succeed(ticket({ status: 'closed' }))),
        },
      });
      const exit = yield* updateTicket({
        ticketId: 'TKT-1001',
        status: 'created',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err).toBeInstanceOf(ConflictError);
    }),
  );

  it.effect('returns NotFoundError when update returns null (race condition)', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        tickets: {
          findByTicketId: vi.fn().mockReturnValue(Effect.succeed(ticket({ status: 'created' }))),
          update: vi.fn().mockReturnValue(Effect.succeed(null)),
        },
      });
      const exit = yield* updateTicket({
        ticketId: 'TKT-1001',
        status: 'in_progress',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err).toBeInstanceOf(NotFoundError);
    }),
  );

  it.effect('updates notes without status change', () =>
    Effect.gen(function* () {
      const existing = ticket({ status: 'created', notes: 'old note' });
      const updated = ticket({ status: 'created', notes: 'new note' });
      const layer = makeLayers({
        tickets: {
          findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
          update: vi.fn().mockReturnValue(Effect.succeed(updated)),
        },
      });
      const result = yield* updateTicket({
        ticketId: 'TKT-1001',
        note: 'new note',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer));
      expect(result).toEqual(updated);
    }),
  );

  it.effect('allows valid transition: created -> in_progress', () =>
    Effect.gen(function* () {
      const existing = ticket({ status: 'created' });
      const updated = ticket({ status: 'in_progress' });
      const layer = makeLayers({
        tickets: {
          findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
          update: vi.fn().mockReturnValue(Effect.succeed(updated)),
        },
      });
      yield* updateTicket({
        ticketId: 'TKT-1001',
        status: 'in_progress',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer));
    }),
  );

  it.effect('allows valid transition: created -> closed', () =>
    Effect.gen(function* () {
      const existing = ticket({ status: 'created' });
      const updated = ticket({ status: 'closed' });
      const layer = makeLayers({
        tickets: {
          findByTicketId: vi.fn().mockReturnValue(Effect.succeed(existing)),
          update: vi.fn().mockReturnValue(Effect.succeed(updated)),
        },
      });
      yield* updateTicket({
        ticketId: 'TKT-1001',
        status: 'closed',
        actorId: 'user_1',
      }).pipe(Effect.provide(layer));
    }),
  );
});

describe('createTicket', () => {
  it.effect('creates a ticket with generated ID', () =>
    Effect.gen(function* () {
      const layer = makeLayers();
      const result = yield* createTicket({
        userId: 'user_1',
        name: 'Test',
        email: 't@x.com',
        issue: 'help',
      }).pipe(Effect.provide(layer));
      expect(result.ticketId).toMatch(/^TKT-[a-f0-9]{8}$/);
      expect(result.status).toBe('created');
    }),
  );

  it.effect('logs audit with create action', () =>
    Effect.gen(function* () {
      const logTicketEvent = vi.fn().mockReturnValue(Effect.void);
      const layer = makeLayers({ audit: { logTicketEvent } });
      yield* createTicket({
        userId: 'user_1',
        name: 'Test',
        email: 't@x.com',
        issue: 'help',
      }).pipe(Effect.provide(layer));
      expect(logTicketEvent).toHaveBeenCalledWith({
        action: 'create',
        ticketId: 'TKT-12345678',
        actorId: 'user_1',
      });
    }),
  );

  it.effect('returns ExternalServiceError when insert fails', () =>
    Effect.gen(function* () {
      const layer = makeLayers({
        tickets: {
          insert: vi.fn().mockReturnValue(Effect.fail(new ExternalServiceError('DB down'))),
        },
      });
      const exit = yield* createTicket({
        userId: 'user_1',
        name: 'Test',
        email: 't@x.com',
        issue: 'help',
      }).pipe(Effect.provide(layer), Effect.exit);
      const err = expectFailure(exit);
      expect(err.code).toBe('external_service');
    }),
  );
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
