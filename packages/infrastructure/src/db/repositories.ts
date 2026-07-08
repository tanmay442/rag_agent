// Drizzle-backed repository implementations. Every function returns
// an `Effect` that fails with `ExternalServiceError` on DB errors.
// The live service layers (see ./services.ts) and the transaction
// context delegate to these.
import { eq, desc, ilike, or, sql, inArray, isNull, and } from 'drizzle-orm';
import { Effect } from 'effect';
import { db } from './client';
import {
  documents,
  chunks,
  tickets,
  users,
  documentAudit,
  ticketAudit,
  type Document,
} from './schema';
import {
  ExternalServiceError,
  type DocumentRow,
  type TicketRow,
  type UserRow,
  type IngestStatus,
  type ListDocumentsOpts,
  type ListDocumentsResult,
  type ListTicketsOpts,
  type ListTicketsResult,
  type ListUsersOpts,
  type ListUsersResult,
  type ListAuditOpts,
  type ListAuditResult,
  type InsertDocumentInput,
  type InsertTicketInput,
  type InsertChunkRow,
  type ChunkSearchHit,
  type UpsertUserInput,
} from '@app/domain';

type Client = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function whereAnd(parts: ReturnType<typeof eq>[]) {
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

function dbError(message: string, cause: unknown): ExternalServiceError {
  return new ExternalServiceError(message, cause);
}

// ---- Documents / Chunks ----

export function findDocumentByName(
  name: string,
  client: Client = db,
): Effect.Effect<DocumentRow | null, ExternalServiceError> {
  return Effect.tryPromise({
    try: () =>
      client.query.documents.findFirst({ where: eq(documents.fileName, name) }) as Promise<Document | undefined>,
    catch: (e) => dbError('Failed to find document by name', e),
  }).pipe(Effect.map((row) => (row as DocumentRow | undefined) ?? null));
}

export function findDocumentById(
  id: number,
  client: Client = db,
): Effect.Effect<DocumentRow | null, ExternalServiceError> {
  return Effect.tryPromise({
    try: () =>
      client.query.documents.findFirst({ where: eq(documents.id, id) }) as Promise<Document | undefined>,
    catch: (e) => dbError('Failed to find document by id', e),
  }).pipe(Effect.map((row) => (row as DocumentRow | undefined) ?? null));
}

export function insertDocument(
  input: InsertDocumentInput,
  client: Client = db,
): Effect.Effect<DocumentRow, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client.insert(documents).values(input).returning();
      if (!row) throw new Error('Failed to insert document');
      return row as DocumentRow;
    },
    catch: (e) => dbError('Failed to insert document', e),
  });
}

export function deleteDocumentById(
  id: number,
  client: Client = db,
): Effect.Effect<void, ExternalServiceError> {
  return Effect.tryPromise({
    try: () => client.delete(documents).where(eq(documents.id, id)),
    catch: (e) => dbError('Failed to delete document', e),
  }).pipe(Effect.asVoid);
}

export function setDocumentStorageKey(
  id: number,
  key: string,
  client: Client = db,
): Effect.Effect<void, ExternalServiceError> {
  return Effect.tryPromise({
    try: () => client.update(documents).set({ storageKey: key }).where(eq(documents.id, id)),
    catch: (e) => dbError('Failed to set document storage key', e),
  }).pipe(Effect.asVoid);
}

export function updateDocumentIngestStatus(
  id: number,
  status: IngestStatus,
  client: Client = db,
): Effect.Effect<void, ExternalServiceError> {
  return Effect.tryPromise({
    try: () => client.update(documents).set({ ingestStatus: status }).where(eq(documents.id, id)),
    catch: (e) => dbError('Failed to update ingest status', e),
  }).pipe(Effect.asVoid);
}

export function softDeleteDocument(
  id: number,
  at: Date,
  client: Client = db,
): Effect.Effect<DocumentRow | null, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client.update(documents).set({ deletedAt: at }).where(eq(documents.id, id)).returning();
      return (row as DocumentRow | undefined) ?? null;
    },
    catch: (e) => dbError('Failed to soft-delete document', e),
  });
}

export function restoreDocument(
  id: number,
  client: Client = db,
): Effect.Effect<DocumentRow | null, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client.update(documents).set({ deletedAt: null }).where(eq(documents.id, id)).returning();
      return (row as DocumentRow | undefined) ?? null;
    },
    catch: (e) => dbError('Failed to restore document', e),
  });
}

export function searchChunksByVector(
  embedding: number[],
  opts: { threshold: number; limit: number },
  client: Client = db,
): Effect.Effect<ChunkSearchHit[], ExternalServiceError> {
  return Effect.gen(function* () {
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every((v) => Number.isFinite(v))) {
      return yield* new ExternalServiceError('Invalid embedding: must be a non-empty array of finite numbers');
    }
    const vectorLiteral = `[${embedding.join(',')}]`;
    const result = yield* Effect.tryPromise({
      try: () =>
        client.execute(sql`
          SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
          FROM chunks
          WHERE 1 - (embedding <=> ${vectorLiteral}::vector) > ${opts.threshold}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${opts.limit}
        `),
      catch: (e) => dbError('Vector search failed', e),
    });
    const rows = (
      result as unknown as { rows?: Array<{ content: string; similarity: number }> }
    ).rows ?? [];
    return rows.map((r) => ({ content: r.content, similarity: Number(r.similarity) }));
  });
}

export function insertChunks(
  rows: InsertChunkRow[],
  client: Client = db,
): Effect.Effect<void, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      if (rows.length === 0) return;
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await client.insert(chunks).values(rows.slice(i, i + BATCH_SIZE));
      }
    },
    catch: (e) => dbError('Failed to insert chunks', e),
  });
}

export function countChunksForDocuments(
  documentIds: number[],
  client: Client = db,
): Effect.Effect<Map<number, number>, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      if (documentIds.length === 0) return new Map<number, number>();
      const rows = await client
        .select({ documentId: chunks.documentId, count: sql<number>`count(*)::int` })
        .from(chunks)
        .where(inArray(chunks.documentId, documentIds))
        .groupBy(chunks.documentId);
      return new Map(rows.map((r) => [r.documentId, r.count]));
    },
    catch: (e) => dbError('Failed to count chunks for documents', e),
  });
}

export function countChunksForAll(client: Client = db): Effect.Effect<number, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client.select({ count: sql<number>`count(*)::int` }).from(chunks);
      return row?.count ?? 0;
    },
    catch: (e) => dbError('Failed to count all chunks', e),
  });
}

export function countChunksForDocument(
  id: number,
  client: Client = db,
): Effect.Effect<number, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const [row] = await client
        .select({ count: sql<number>`count(*)::int` })
        .from(chunks)
        .where(eq(chunks.documentId, id));
      return row?.count ?? 0;
    },
    catch: (e) => dbError('Failed to count chunks for document', e),
  });
}

export function recountChunksForAll(
  client: Client = db,
): Effect.Effect<Array<{ documentId: number; count: number }>, ExternalServiceError> {
  return Effect.tryPromise({
    try: () =>
      client
        .select({ documentId: chunks.documentId, count: sql<number>`count(*)::int` })
        .from(chunks)
        .groupBy(chunks.documentId),
    catch: (e) => dbError('Failed to recount chunks', e),
  });
}

export function listDocuments(
  opts: ListDocumentsOpts,
  client: Client = db,
): Effect.Effect<ListDocumentsResult, ExternalServiceError> {
  return Effect.tryPromise({
    try: async () => {
      const whereParts = [] as ReturnType<typeof eq>[];
      if (!opts.includeDeleted) whereParts.push(isNull(documents.deletedAt));
      if (opts.search) whereParts.push(ilike(documents.fileName, `%${opts.search.replace(/[%_]/g, '\\$&')}%`));
      const where = whereAnd(whereParts);
      const rows = await client
        .select({
          id: documents.id,
          fileName: documents.fileName,
          fileHash: documents.fileHash,
          uploadedBy: documents.uploadedBy,
          uploadedAt: documents.uploadedAt,
          storageKey: documents.storageKey,
          ingestStatus: documents.ingestStatus,
          hasBlob: sql<boolean>`${documents.storageKey} IS NOT NULL`.as('hasBlob'),
          deletedAt: documents.deletedAt,
          total: sql<number>`count(*) over()`.as('total'),
        })
        .from(documents)
        .where(where)
        .orderBy(desc(documents.uploadedAt))
        .limit(opts.limit)
        .offset(opts.offset);
      const total = rows[0]?.total ?? 0;
      return {
        documents: rows as unknown as Array<DocumentRow & { hasBlob: boolean }>,
        total,
      };
    },
    catch: (e) => dbError('Failed to list documents', e),
  });
}

// ---- Tickets ----

export const ticketRepo = {
  findByTicketId(ticketId: string, client: Client = db): Effect.Effect<TicketRow | null, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const row = await client.query.tickets.findFirst({ where: eq(tickets.ticketId, ticketId) });
        return (row as TicketRow | undefined) ?? null;
      },
      catch: (e) => dbError('Failed to find ticket', e),
    });
  },
  list(opts: ListTicketsOpts, client: Client = db): Effect.Effect<ListTicketsResult, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const limit = Math.min(Math.max(opts.limit, 1), 500);
        const whereParts = [] as ReturnType<typeof eq>[];
        if (opts.status) whereParts.push(eq(tickets.status, opts.status));
        if (opts.assignee !== undefined && opts.assignee !== null) {
          whereParts.push(eq(tickets.assignedTo, opts.assignee));
        }
        if (opts.search) whereParts.push(ilike(tickets.issue, `%${opts.search.replace(/[%_]/g, '\\$&')}%`));
        const where = whereAnd(whereParts);
        const rows = await client
          .select({
            id: tickets.id,
            ticketId: tickets.ticketId,
            userId: tickets.userId,
            name: tickets.name,
            email: tickets.email,
            issue: tickets.issue,
            status: tickets.status,
            assignedTo: tickets.assignedTo,
            notes: tickets.notes,
            createdAt: tickets.createdAt,
            total: sql<number>`count(*) over()`.as('total'),
          })
          .from(tickets)
          .where(where)
          .orderBy(desc(tickets.createdAt))
          .limit(limit)
          .offset(opts.offset);
        const total = rows[0]?.total ?? 0;
        return { rows: rows as unknown as TicketRow[], total };
      },
      catch: (e) => dbError('Failed to list tickets', e),
    });
  },
  latest(client: Client = db): Effect.Effect<{ id: number; ticketId: string } | null, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [latest] = await client
          .select({ id: tickets.id, ticketId: tickets.ticketId })
          .from(tickets)
          .orderBy(desc(tickets.id))
          .limit(1);
        return latest ?? null;
      },
      catch: (e) => dbError('Failed to get latest ticket', e),
    });
  },
  insert(input: InsertTicketInput, client: Client = db): Effect.Effect<TicketRow, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client.insert(tickets).values(input).returning();
        if (!row) throw new Error('Failed to insert ticket');
        return row as TicketRow;
      },
      catch: (e) => dbError('Failed to insert ticket', e),
    });
  },
  update(
    ticketId: string,
    patch: Partial<Pick<TicketRow, 'status' | 'assignedTo' | 'notes'>>,
    client: Client = db,
  ): Effect.Effect<TicketRow | null, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        if (Object.keys(patch).length === 0) return null;
        const [row] = await client.update(tickets).set(patch).where(eq(tickets.ticketId, ticketId)).returning();
        return (row as TicketRow | undefined) ?? null;
      },
      catch: (e) => dbError('Failed to update ticket', e),
    });
  },
  countAll(client: Client = db): Effect.Effect<number, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client.select({ count: sql<number>`count(*)::int` }).from(tickets);
        return row?.count ?? 0;
      },
      catch: (e) => dbError('Failed to count tickets', e),
    });
  },
  countOpen(client: Client = db): Effect.Effect<number, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client
          .select({ count: sql<number>`count(*)::int` })
          .from(tickets)
          .where(sql`${tickets.status} <> 'closed'`);
        return row?.count ?? 0;
      },
      catch: (e) => dbError('Failed to count open tickets', e),
    });
  },
};

// ---- Users ----

export const userRepo = {
  upsertFromClerk(input: UpsertUserInput, client: Client = db): Effect.Effect<UserRow, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client
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
        return row as UserRow;
      },
      catch: (e) => dbError('Failed to upsert user', e),
    });
  },
  findByClerkId(clerkUserId: string, client: Client = db): Effect.Effect<UserRow | null, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const row = await client.query.users.findFirst({ where: eq(users.clerkUserId, clerkUserId) });
        return (row as UserRow | undefined) ?? null;
      },
      catch: (e) => dbError('Failed to find user', e),
    });
  },
  findByIds(clerkUserIds: string[], client: Client = db): Effect.Effect<UserRow[], ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        if (clerkUserIds.length === 0) return [];
        const rows = await client.query.users.findMany({
          where: (u, { inArray }) => inArray(u.clerkUserId, clerkUserIds),
        });
        return rows as UserRow[];
      },
      catch: (e) => dbError('Failed to find users by ids', e),
    });
  },
  setRole(clerkUserId: string, role: 'admin' | 'user', client: Client = db): Effect.Effect<UserRow | null, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client.update(users).set({ role }).where(eq(users.clerkUserId, clerkUserId)).returning();
        return (row as UserRow | undefined) ?? null;
      },
      catch: (e) => dbError('Failed to set user role', e),
    });
  },
  touchLastSeen(clerkUserId: string, client: Client = db): Effect.Effect<void, ExternalServiceError> {
    return Effect.tryPromise({
      try: () => client.update(users).set({ lastSeenAt: sql`now()` }).where(eq(users.clerkUserId, clerkUserId)),
      catch: (e) => dbError('Failed to update last seen', e),
    }).pipe(Effect.asVoid);
  },
  list(opts: ListUsersOpts, client: Client = db): Effect.Effect<ListUsersResult, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const search = opts.search?.trim();
        const where = search
          ? or(
              ilike(users.email, `%${search.replace(/[%_]/g, '\\$&')}%`),
              ilike(users.name, `%${search.replace(/[%_]/g, '\\$&')}%`),
            )
          : undefined;
        const rows = await client
          .select({
            clerkUserId: users.clerkUserId,
            email: users.email,
            name: users.name,
            imageUrl: users.imageUrl,
            role: users.role,
            lastSeenAt: users.lastSeenAt,
            createdAt: users.createdAt,
            total: sql<number>`count(*) over()`.as('total'),
          })
          .from(users)
          .where(where)
          .orderBy(users.createdAt)
          .limit(opts.limit)
          .offset(opts.offset);
        const total = rows[0]?.total ?? 0;
        return { rows: rows as unknown as UserRow[], total };
      },
      catch: (e) => dbError('Failed to list users', e),
    });
  },
  countAll(client: Client = db): Effect.Effect<number, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const [row] = await client.select({ count: sql<number>`count(*)::int` }).from(users);
        return row?.count ?? 0;
      },
      catch: (e) => dbError('Failed to count users', e),
    });
  },
  syncClerkRole(clerkUserId: string, role: 'admin' | 'user'): Effect.Effect<void, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const { clerkClient } = await import('../auth');
        const client = await clerkClient();
        await client.users.updateUserMetadata(clerkUserId, {
          publicMetadata: { role },
        });
      },
      catch: (e) => dbError('Failed to sync Clerk role', e),
    });
  },
};

// ---- Audit ----

export const auditRepo = {
  logDocumentEvent(
    input: { action: 'upload' | 'replace' | 'delete' | 'restore'; documentId: number; actorId: string },
    client: Client = db,
  ): Effect.Effect<void, ExternalServiceError> {
    return Effect.tryPromise({
      try: () => client.insert(documentAudit).values(input),
      catch: (e) => dbError('Failed to log document event', e),
    }).pipe(Effect.asVoid);
  },
  logTicketEvent(
    input: { action: 'create' | 'assign' | 'status_change' | 'note' | 'role_change'; ticketId: string; actorId: string },
    client: Client = db,
  ): Effect.Effect<void, ExternalServiceError> {
    return Effect.tryPromise({
      try: () => client.insert(ticketAudit).values(input),
      catch: (e) => dbError('Failed to log ticket event', e),
    }).pipe(Effect.asVoid);
  },
  list(input: ListAuditOpts, client: Client = db): Effect.Effect<ListAuditResult, ExternalServiceError> {
    return Effect.tryPromise({
      try: async () => {
        const wantDoc = !input.ticketId || input.documentId !== undefined;
        const wantTix = !input.documentId || input.ticketId !== undefined;
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
        const countResult = await client.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM (
            SELECT id FROM document_audit ${docWhere}
            UNION ALL
            SELECT id FROM ticket_audit ${tixWhere}
          ) c
        `);
        const total = (countResult as unknown as { rows?: Array<{ count: number }> }).rows?.[0]?.count ?? 0;
        const actorResult = await client.execute<{
          id: number; kind: string; document_id: number | null; ticket_id: string | null;
          actor_id: string; action: string; at: Date; actor_name: string | null;
        }>(sql`
          SELECT c.*, u.name AS actor_name FROM (
            SELECT id, 'document' AS kind, document_id, NULL::text AS ticket_id, actor_id, action, at
            FROM document_audit ${docWhere}
            UNION ALL
            SELECT id, 'ticket' AS kind, NULL::int AS document_id, ticket_id, actor_id, action, at
            FROM ticket_audit ${tixWhere}
          ) c
          LEFT JOIN users u ON u.clerk_user_id = c.actor_id
          ORDER BY c.at DESC
          LIMIT ${input.limit}
          OFFSET ${input.offset}
        `);
        const rawRows = (actorResult as unknown as { rows?: Array<{ id: number; kind: string; document_id: number | null; ticket_id: string | null; actor_id: string; action: string; at: Date; actor_name: string | null }> }).rows ?? [];
        const events = rawRows.map((r) => ({
          id: r.id,
          kind: r.kind as 'document' | 'ticket',
          documentId: r.document_id ?? null,
          ticketId: r.ticket_id ?? null,
          actorId: r.actor_id,
          actorName: r.actor_name ?? null,
          action: r.action,
          at: r.at instanceof Date ? r.at : new Date(r.at),
        }));
        return { events, total };
      },
      catch: (e) => dbError('Failed to list audit events', e),
    });
  },
};
