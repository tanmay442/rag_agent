import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documentAudit, ticketAudit, users } from '@/lib/db/schema';

export interface AuditEvent {
  id: number;
  kind: 'document' | 'ticket';
  documentId: number | null;
  ticketId: string | null;
  actorId: string;
  actorName: string | null;
  action: string;
  at: Date;
}

export interface ListAuditParams {
  documentId?: number;
  ticketId?: string;
  limit?: number;
  offset?: number;
}

export interface ListAuditResult {
  events: AuditEvent[];
  total: number;
}

export async function listAudit(
  params: ListAuditParams = {},
): Promise<ListAuditResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const wantDoc = !params.ticketId || params.documentId !== undefined;
  const wantTix = !params.documentId || params.ticketId !== undefined;

  // Run real COUNT(*) queries for accurate pagination totals.
  const [docCount, tixCount] = await Promise.all([
    wantDoc
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(documentAudit)
          .where(
            params.documentId
              ? eq(documentAudit.documentId, params.documentId)
              : undefined,
          )
          .then((r) => r[0]?.count ?? 0)
      : Promise.resolve(0),
    wantTix
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(ticketAudit)
          .where(
            params.ticketId
              ? eq(ticketAudit.ticketId, params.ticketId)
              : undefined,
          )
          .then((r) => r[0]?.count ?? 0)
      : Promise.resolve(0),
  ]);
  const total = docCount + tixCount;

  // UNION ALL with global ORDER BY for stable, correct pagination.
  const docWhere = params.documentId
    ? sql`WHERE document_id = ${params.documentId}`
    : wantDoc
      ? sql``
      : sql`WHERE 1 = 0`;
  const tixWhere = params.ticketId
    ? sql`WHERE ticket_id = ${params.ticketId}`
    : wantTix
      ? sql``
      : sql`WHERE 1 = 0`;

  const result = await db.execute<{
    id: number;
    kind: string;
    document_id: number | null;
    ticket_id: string | null;
    actor_id: string;
    action: string;
    at: Date;
  }>(sql`
    SELECT * FROM (
      SELECT
        id,
        'document' AS kind,
        document_id,
        NULL::text AS ticket_id,
        actor_id,
        action,
        at
      FROM document_audit
      ${docWhere}

      UNION ALL

      SELECT
        id,
        'ticket' AS kind,
        NULL::int AS document_id,
        ticket_id,
        actor_id,
        action,
        at
      FROM ticket_audit
      ${tixWhere}
    ) combined
    ORDER BY at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const rawRows = (
    result as unknown as {
      rows?: Array<{
        id: number;
        kind: string;
        document_id: number | null;
        ticket_id: string | null;
        actor_id: string;
        action: string;
        at: string | Date;
      }>;
    }
  ).rows ?? [];
  const events: AuditEvent[] = rawRows.map((r) => ({
    id: r.id,
    kind: r.kind as 'document' | 'ticket',
    documentId: r.document_id ?? null,
    ticketId: r.ticket_id ?? null,
    actorId: r.actor_id,
    actorName: null,
    action: r.action,
    at: r.at instanceof Date ? r.at : new Date(r.at),
  }));

  // Resolve actor names in a single follow-up query.
  const actorIds = Array.from(new Set(events.map((e) => e.actorId)));
  const actorMap = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const actorRows = await db
      .select({
        clerkUserId: users.clerkUserId,
        name: users.name,
      })
      .from(users)
      .where(inArray(users.clerkUserId, actorIds));
    for (const r of actorRows) {
      actorMap.set(r.clerkUserId, r.name);
    }
  }
  for (const e of events) {
    e.actorName = actorMap.get(e.actorId) ?? null;
  }
  return { events, total };
}
