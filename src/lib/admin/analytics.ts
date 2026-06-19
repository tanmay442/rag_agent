import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, chunks, tickets, users } from '@/lib/db/schema';
import { getTopQueries } from '@/lib/auth/query-stats';

export interface AnalyticsSummary {
  documentCount: number;
  chunkCount: number;
  ticketCount: number;
  openTicketCount: number;
  usersCount: number;
  topQueries: Array<{ q: string; count: number }>;
  // Note: the top-queries counter is in-process and resets on cold start.
  coldStart: true;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const [docRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(sql`${documents.deletedAt} IS NULL`);
  const [chunkRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks);
  const [tixRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets);
  const [openRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(sql`${tickets.status} <> 'closed'`);
  const [userRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return {
    documentCount: docRow?.count ?? 0,
    chunkCount: chunkRow?.count ?? 0,
    ticketCount: tixRow?.count ?? 0,
    openTicketCount: openRow?.count ?? 0,
    usersCount: userRow?.count ?? 0,
    topQueries: getTopQueries(10),
    coldStart: true,
  };
}
