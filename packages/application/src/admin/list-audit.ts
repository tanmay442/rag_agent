import { Effect } from 'effect';
import { Audit } from '@app/domain';
import { MAX_AUDIT_LIMIT } from '../../../../config/constants';
import { sanitizePagination } from '../pagination';

export const listAudit = Effect.fn('Admin.listAudit')(
  function* (input: {
    documentId?: number;
    ticketId?: string;
    limit?: number;
    offset?: number;
  }) {
    const audit = yield* Audit;
    const { limit, offset } = sanitizePagination(input.limit, input.offset, MAX_AUDIT_LIMIT, 50);
    return yield* audit.list({
      documentId: input.documentId,
      ticketId: input.ticketId,
      limit,
      offset,
    });
  },
);
