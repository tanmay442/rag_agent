import 'server-only';
import { db } from '@/lib/db/client';
import { documentAudit, ticketAudit } from '@/lib/db/schema';

export type DocumentAuditAction = 'upload' | 'replace' | 'delete' | 'restore';
export type TicketAuditAction =
  | 'create'
  | 'assign'
  | 'status_change'
  | 'note'
  | 'impersonation';

export interface LogDocumentEventInput {
  action: DocumentAuditAction;
  documentId: number;
  actorId: string;
}

export async function logDocumentEvent(
  input: LogDocumentEventInput,
): Promise<void> {
  await db.insert(documentAudit).values({
    action: input.action,
    documentId: input.documentId,
    actorId: input.actorId,
  });
}

export interface LogTicketEventInput {
  action: TicketAuditAction;
  ticketId: string;
  actorId: string;
}

export async function logTicketEvent(
  input: LogTicketEventInput,
): Promise<void> {
  await db.insert(ticketAudit).values({
    action: input.action,
    ticketId: input.ticketId,
    actorId: input.actorId,
  });
}
