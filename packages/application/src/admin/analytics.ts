import { ok, type Result } from '@app/domain';
import type { DocumentRepository, ChunkRepository, TicketRepository, UserRepository, QueryStats } from '../ports/index';

export interface AnalyticsSummary {
  documentCount: number;
  chunkCount: number;
  ticketCount: number;
  openTicketCount: number;
  usersCount: number;
  topQueries: Array<{ q: string; count: number }>;
  coldStart: boolean;
}

export async function getAnalyticsSummary(
  deps: {
    documents: DocumentRepository;
    chunks: ChunkRepository;
    tickets: TicketRepository;
    users: UserRepository;
    stats: QueryStats;
  },
): Promise<Result<AnalyticsSummary>> {
  const [docCount, chunkCount, ticketCount, openTicketCount, usersCount] = await Promise.all([
    deps.documents.list({ limit: 1, offset: 0 }).then((r) => r.total),
    deps.chunks.countForAll(),
    deps.tickets.countAll(),
    deps.tickets.countOpen(),
    deps.users.countAll(),
  ]);
  return ok({
    documentCount: docCount,
    chunkCount,
    ticketCount,
    openTicketCount,
    usersCount,
    topQueries: deps.stats.top(10),
    coldStart: docCount === 0,
  });
}
