import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertCalls: Array<{
  action: string;
  documentId?: number | null;
  ticketId?: string | null;
  actorId: string;
}> = [];

const auditMarker = vi.hoisted(() => ({
  docTableRef: { current: null as unknown },
  tixTableRef: { current: null as unknown },
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        if (table === auditMarker.docTableRef.current) {
          insertCalls.push({
            action: v['action'] as string,
            documentId: v['documentId'] as number,
            actorId: v['actorId'] as string,
          });
        } else if (table === auditMarker.tixTableRef.current) {
          insertCalls.push({
            action: v['action'] as string,
            ticketId: v['ticketId'] as string,
            actorId: v['actorId'] as string,
          });
        }
        return [];
      },
    }),
  },
}));

import { logDocumentEvent, logTicketEvent } from './audit';
import { documentAudit, ticketAudit } from '@/lib/db/schema';

auditMarker.docTableRef.current = documentAudit;
auditMarker.tixTableRef.current = ticketAudit;

beforeEach(() => {
  insertCalls.length = 0;
});

describe('audit', () => {
  it('logDocumentEvent inserts a document_audit row', async () => {
    await logDocumentEvent({ action: 'upload', documentId: 1, actorId: 'user_1' });
    expect(insertCalls).toEqual([
      { action: 'upload', documentId: 1, actorId: 'user_1' },
    ]);
  });

  it('logTicketEvent inserts a ticket_audit row', async () => {
    await logTicketEvent({ action: 'create', ticketId: 'TKT-1001', actorId: 'user_1' });
    expect(insertCalls).toEqual([
      { action: 'create', ticketId: 'TKT-1001', actorId: 'user_1' },
    ]);
  });

  it('never throws on the happy path', async () => {
    await expect(
      logDocumentEvent({ action: 'delete', documentId: 2, actorId: 'admin_1' }),
    ).resolves.toBeUndefined();
  });
});
