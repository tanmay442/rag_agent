import { Effect } from 'effect';
import { Documents, Chunks, Tickets, Users, QueryStats } from '@app/domain';

export interface AnalyticsSummary {
  documentCount: number;
  chunkCount: number;
  ticketCount: number;
  openTicketCount: number;
  usersCount: number;
  topQueries: Array<{ q: string; count: number }>;
  coldStart: boolean;
}

export const getAnalyticsSummary = Effect.fn('Admin.getAnalyticsSummary')(
  function* () {
    const documents = yield* Documents;
    const chunks = yield* Chunks;
    const tickets = yield* Tickets;
    const users = yield* Users;
    const stats = yield* QueryStats;
    const docList = yield* documents.list({ limit: 1, offset: 0 });
    const [chunkCount, ticketCount, openTicketCount, usersCount, topQueries] = yield* Effect.all(
      [
        chunks.countForAll(),
        tickets.countAll(),
        tickets.countOpen(),
        users.countAll(),
        stats.top(10),
      ],
      { concurrency: 'unbounded' },
    );
    const documentCount = docList.total;
    return {
      documentCount,
      chunkCount,
      ticketCount,
      openTicketCount,
      usersCount,
      topQueries,
      coldStart: documentCount === 0,
    } satisfies AnalyticsSummary;
  },
);
