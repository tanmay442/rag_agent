// Drizzle-backed implementations of the application's
// repository ports. Each function returns the shape the
// application expects (Drizzle's $inferSelect row types
// for documents/chunks/tickets/users; AuditRepo /
// UserRepo / TicketRepo aliases for the application).
import { eq, desc, ilike, or, sql, inArray, isNull, and, isNotNull } from 'drizzle-orm';
import { db } from './client';
import {
  documents,
  chunks,
  tickets,
  users,
  documentAudit,
  ticketAudit,
  type Document,
  type Chunk,
  type Ticket,
  type User,
} from './schema';

// ---- Documents / Chunks ----

export async function findDocumentByName(name: string): Promise<Document | null> {
  const row = await db.query.documents.findFirst({ where: eq(documents.fileName, name) });
  return (row as Document | undefined) ?? null;
}

export async function findDocumentById(id: number): Promise<Document | null> {
  const row = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  return (row as Document | undefined) ?? null;
}

export async function insertDocument(input: {
  fileName: string;
  fileHash: string;
  uploadedBy: string;
}): Promise<Document> {
  const [row] = await db.insert(documents).values(input).returning();
  if (!row) throw new Error('Failed to insert document');
  return row as Document;
}

export async function deleteDocumentById(id: number): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}

export async function updateDocumentBlob(id: number, blob: Buffer): Promise<void> {
  await db.update(documents).set({ blob }).where(eq(documents.id, id));
}

export async function softDeleteDocument(id: number, at: Date): Promise<Document | null> {
  const [row] = await db.update(documents).set({ deletedAt: at }).where(eq(documents.id, id)).returning();
  return (row as Document | null) ?? null;
}

export async function restoreDocument(id: number): Promise<Document | null> {
  const [row] = await db.update(documents).set({ deletedAt: null }).where(eq(documents.id, id)).returning();
  return (row as Document | null) ?? null;
}

export async function searchChunksByVector(
  embedding: number[],
  opts: { threshold: number; limit: number },
): Promise<Array<{ content: string; similarity: number }>> {
  const vectorLiteral = `[${embedding.join(',')}]`;
  const result = await db.execute(sql`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM chunks
    WHERE 1 - (embedding <=> ${vectorLiteral}::vector) > ${opts.threshold}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${opts.limit}
  `);
  const rows = (result as unknown as { rows?: Array<{ content: string; similarity: number }> })
    .rows ?? [];
  return rows.map((r) => ({ content: r.content, similarity: Number(r.similarity) }));
}

export async function insertChunks(rows: Array<{ documentId: number; content: string; embedding: number[] }>): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(chunks).values(rows);
}

export async function countChunksForDocuments(documentIds: number[]): Promise<Map<number, number>> {
  if (documentIds.length === 0) return new Map();
  const rows = await db
    .select({ documentId: chunks.documentId, count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(inArray(chunks.documentId, documentIds))
    .groupBy(chunks.documentId);
  return new Map(rows.map((r) => [r.documentId, r.count]));
}

export async function countChunksForAll(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(chunks);
  return row?.count ?? 0;
}

export async function countChunksForDocument(id: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(eq(chunks.documentId, id));
  return row?.count ?? 0;
}

export async function recountChunksForAll(): Promise<Array<{ documentId: number; count: number }>> {
  const rows = await db
    .select({ documentId: chunks.documentId, count: sql<number>`count(*)::int` })
    .from(chunks)
    .groupBy(chunks.documentId);
  return rows;
}

// ---- Tickets ----

export const ticketRepo = {
  async findByTicketId(ticketId: string): Promise<Ticket | null> {
    const row = await db.query.tickets.findFirst({ where: eq(tickets.ticketId, ticketId) });
    return (row as Ticket | undefined) ?? null;
  },
  async list(opts: {
    status?: string;
    assignee?: string | null;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: Ticket[]; total: number }> {
    const whereParts = [] as ReturnType<typeof eq>[];
    if (opts.status) whereParts.push(eq(tickets.status, opts.status));
    if (opts.assignee !== undefined && opts.assignee !== null) {
      whereParts.push(eq(tickets.assignedTo, opts.assignee));
    }
    if (opts.search) whereParts.push(ilike(tickets.issue, `%${opts.search}%`));
    const where = whereParts.length === 0
      ? undefined
      : whereParts.length === 1
        ? whereParts[0]
        : and(...whereParts);
    const rows = (await db
      .select()
      .from(tickets)
      .where(where)
      .orderBy(desc(tickets.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)) as Ticket[];
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(where);
    return { rows, total: totalRow?.count ?? 0 };
  },
  async latest(): Promise<{ id: number; ticketId: string } | null> {
    const [latest] = await db
      .select({ id: tickets.id, ticketId: tickets.ticketId })
      .from(tickets)
      .orderBy(desc(tickets.id))
      .limit(1);
    return latest ?? null;
  },
  async insert(input: { ticketId: string; userId: string; name: string; email: string; issue: string }): Promise<Ticket> {
    const [row] = await db.insert(tickets).values(input).returning();
    if (!row) throw new Error('Failed to insert ticket');
    return row as Ticket;
  },
  async update(ticketId: string, patch: Partial<Pick<Ticket, 'status' | 'assignedTo' | 'notes'>>): Promise<Ticket | null> {
    const [row] = await db.update(tickets).set(patch).where(eq(tickets.ticketId, ticketId)).returning();
    return (row as Ticket | null) ?? null;
  },
  async countAll(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tickets);
    return row?.count ?? 0;
  },
  async countOpen(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(sql`${tickets.status} <> 'closed'`);
    return row?.count ?? 0;
  },
};

// ---- Users ----

export const userRepo = {
  async upsertFromClerk(input: {
    clerkUserId: string;
    email: string;
    name?: string | null;
    imageUrl?: string | null;
    role: 'admin' | 'user';
  }): Promise<User> {
    const [row] = await db
      .insert(users)
      .values(input)
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          email: input.email,
          name: input.name ?? null,
          imageUrl: input.imageUrl ?? null,
          role: input.role,
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert user');
    return row as User;
  },
  async findByClerkId(clerkUserId: string): Promise<User | null> {
    const row = await db.query.users.findFirst({ where: eq(users.clerkUserId, clerkUserId) });
    return (row as User | undefined) ?? null;
  },
  async setRole(clerkUserId: string, role: 'admin' | 'user'): Promise<User | null> {
    const [row] = await db.update(users).set({ role }).where(eq(users.clerkUserId, clerkUserId)).returning();
    return (row as User | null) ?? null;
  },
  async touchLastSeen(clerkUserId: string): Promise<void> {
    await db.update(users).set({ lastSeenAt: sql`now()` }).where(eq(users.clerkUserId, clerkUserId));
  },
  async list(opts: { search?: string; limit: number; offset: number }): Promise<{ rows: User[]; total: number }> {
    const search = opts.search?.trim();
    const where = search
      ? or(
          ilike(users.email, `%${search.replace(/[%_]/g, '\\$&')}%`),
          ilike(users.name, `%${search.replace(/[%_]/g, '\\$&')}%`),
        )
      : undefined;
    const rows = (await db
      .select()
      .from(users)
      .where(where)
      .orderBy(users.createdAt)
      .limit(opts.limit)
      .offset(opts.offset)) as User[];
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where);
    return { rows, total: totalRow?.count ?? 0 };
  },
  async countAll(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return row?.count ?? 0;
  },
  async syncClerkRole(clerkUserId: string, role: 'admin' | 'user'): Promise<void> {
    const { clerkClient } = await import('../auth/clerk-session');
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role },
    });
  },
};

// ---- Audit ----

export const auditRepo = {
  async logDocumentEvent(input: { action: 'upload' | 'replace' | 'delete' | 'restore'; documentId: number; actorId: string }): Promise<void> {
    await db.insert(documentAudit).values(input);
  },
  async logTicketEvent(input: { action: 'create' | 'assign' | 'status_change' | 'note' | 'impersonation'; ticketId: string; actorId: string }): Promise<void> {
    await db.insert(ticketAudit).values(input);
  },
  async list(input: { documentId?: number; ticketId?: string; limit: number; offset: number }): Promise<{
    events: Array<{
      id: number; kind: 'document' | 'ticket';
      documentId: number | null; ticketId: string | null;
      actorId: string; actorName: string | null;
      action: string; at: Date;
    }>;
    total: number;
  }> {
    const wantDoc = !input.ticketId || input.documentId !== undefined;
    const wantTix = !input.documentId || input.ticketId !== undefined;
    const [docCount, tixCount] = await Promise.all([
      wantDoc
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(documentAudit)
            .where(input.documentId ? eq(documentAudit.documentId, input.documentId) : undefined)
            .then((r) => r[0]?.count ?? 0)
        : Promise.resolve(0),
      wantTix
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(ticketAudit)
            .where(input.ticketId ? eq(ticketAudit.ticketId, input.ticketId) : undefined)
            .then((r) => r[0]?.count ?? 0)
        : Promise.resolve(0),
    ]);
    const total = docCount + tixCount;
    const docWhere = input.documentId
      ? sql`WHERE document_id = ${input.documentId}`
      : wantDoc
        ? sql``
        : sql`WHERE 1 = 0`;
    const tixWhere = input.ticketId
      ? sql`WHERE ticket_id = ${input.ticketId}`
      : wantTix
        ? sql``
        : sql`WHERE 1 = 0`;
    const result = await db.execute<{
      id: number; kind: string; document_id: number | null; ticket_id: string | null;
      actor_id: string; action: string; at: Date;
    }>(sql`
      SELECT * FROM (
        SELECT id, 'document' AS kind, document_id, NULL::text AS ticket_id, actor_id, action, at
        FROM document_audit ${docWhere}
        UNION ALL
        SELECT id, 'ticket' AS kind, NULL::int AS document_id, ticket_id, actor_id, action, at
        FROM ticket_audit ${tixWhere}
      ) combined
      ORDER BY at DESC
      LIMIT ${input.limit}
      OFFSET ${input.offset}
    `);
    const rawRows = (result as unknown as { rows?: Array<any> }).rows ?? [];
    const events = rawRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      documentId: r.document_id ?? null,
      ticketId: r.ticket_id ?? null,
      actorId: r.actor_id,
      actorName: null as string | null,
      action: r.action,
      at: r.at instanceof Date ? r.at : new Date(r.at),
    }));
    const actorIds = Array.from(new Set(events.map((e) => e.actorId)));
    if (actorIds.length > 0) {
      const actorRows = await db
        .select({ clerkUserId: users.clerkUserId, name: users.name })
        .from(users)
        .where(inArray(users.clerkUserId, actorIds));
      const actorMap = new Map(actorRows.map((r) => [r.clerkUserId, r.name]));
      for (const e of events) e.actorName = actorMap.get(e.actorId) ?? null;
    }
    return { events, total };
  },
};
