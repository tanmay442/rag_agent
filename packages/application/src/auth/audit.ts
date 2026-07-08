// Use-case: log document / ticket audit events.
import { Effect } from 'effect';
import { Audit } from '@app/domain';

export const logDocumentEvent = Effect.fn('Audit.logDocumentEvent')(
  function* (input: {
    action: 'upload' | 'replace' | 'delete' | 'restore';
    documentId: number;
    actorId: string;
  }) {
    const audit = yield* Audit;
    yield* audit.logDocumentEvent(input);
  },
);

export const logTicketEvent = Effect.fn('Audit.logTicketEvent')(
  function* (input: {
    action: 'create' | 'assign' | 'status_change' | 'note' | 'role_change';
    ticketId: string;
    actorId: string;
  }) {
    const audit = yield* Audit;
    yield* audit.logTicketEvent(input);
  },
);
