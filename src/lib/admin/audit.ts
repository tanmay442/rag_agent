import 'server-only';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
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

  const docFilter = params.documentId
    ? [eq(documentAudit.documentId, params.documentId)] as const
    : [];
  const tixFilter = params.ticketId
    ? [eq(ticketAudit.ticketId, params.ticketId)] as const
    : [];

  // Read both tables in parallel. We merge in code so the response can
  // include both kinds in a single, stable order.
  const wantDoc = !params.ticketId || params.documentId !== undefined;
  const wantTix = !params.documentId || params.ticketId !== undefined;

  const [docRows, tixRows] = await Promise.all([
    wantDoc
      ? db
          .select({
            id: documentAudit.id,
            kind: sql<'document'>`'document'`.as('kind'),
            documentId: documentAudit.documentId,
            ticketId: sql<string | null>`NULL`.as('ticket_id'),
            actorId: documentAudit.actorId,
            action: documentAudit.action,
            at: documentAudit.at,
          })
          .from(documentAudit)
          .where(docFilter.length > 0 ? and(...docFilter) : undefined)
      : Promise.resolve([] as Array<{
          id: number;
          kind: 'document';
          documentId: number | null;
          ticketId: string | null;
          actorId: string;
          action: string;
          at: Date;
        }>),
    wantTix
      ? db
          .select({
            id: ticketAudit.id,
            kind: sql<'ticket'>`'ticket'`.as('kind'),
            documentId: sql<number | null>`NULL`.as('document_id'),
            ticketId: ticketAudit.ticketId,
            actorId: ticketAudit.actorId,
            action: ticketAudit.action,
            at: ticketAudit.at,
          })
          .from(ticketAudit)
          .where(tixFilter.length > 0 ? and(...tixFilter) : undefined)
      : Promise.resolve([] as Array<{
          id: number;
          kind: 'ticket';
          documentId: number | null;
          ticketId: string | null;
          actorId: string;
          action: string;
          at: Date;
        }>),
  ]);

  const merged: AuditEvent[] = [...docRows, ...tixRows]
    .map((r) => ({
      id: r.id,
      kind: r.kind as 'document' | 'ticket',
      documentId: r.documentId ?? null,
      ticketId: r.ticketId ?? null,
      actorId: r.actorId,
      actorName: null as string | null,
      action: r.action,
      at: r.at,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const total = merged.length;
  const events = merged.slice(offset, offset + limit);

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
      .where(sql`${users.clerkUserId} = ANY(${actorIds})`);
    for (const r of actorRows) {
      actorMap.set(r.clerkUserId, r.name);
    }
  }
  for (const e of events) {
    e.actorName = actorMap.get(e.actorId) ?? null;
  }
  return { events, total };
}
