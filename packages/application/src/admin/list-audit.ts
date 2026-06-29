import { err, ok, type Result, ExternalServiceError } from '@app/domain';
import type { AuditLog } from '../ports/index';

export async function listAudit(
  input: { documentId?: number; ticketId?: string; limit?: number; offset?: number },
  deps: { audit: AuditLog },
): Promise<Result<{ events: Array<{ id: number; kind: 'document' | 'ticket'; documentId: number | null; ticketId: string | null; actorId: string; actorName: string | null; action: string; at: Date }>; total: number }>> {
  try {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const r = await deps.audit.list({
      documentId: input.documentId,
      ticketId: input.ticketId,
      limit,
      offset,
    });
    return ok(r);
  } catch (e) {
    return err(new ExternalServiceError('Failed to list audit events', e));
  }
}
