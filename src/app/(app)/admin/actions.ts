'use server';

import { revalidatePath } from 'next/cache';
import { getComposition, requireAdmin, ForbiddenError } from '@/composition';
import { UnauthorizedError } from '@app/domain';
import type { TicketStatus } from '@app/application/admin/tickets';
import type { AppRole } from '@app/infrastructure/auth';
import { toSafeError } from '@/lib/http';

async function requireAdminOrError(): Promise<
  | { user: { id: string; email: string; name: string; imageUrl: string | null; role: 'admin' | 'user' } }
  | { error: string }
> {
  try {
    return await requireAdmin();
  } catch (err) {
    // Both real ForbiddenError and plain Error with status 403 (e.g.
    // thrown by tests or upstream middleware) should be treated as
    // 'Forbidden' so the page renders an inline error rather than
    // crashing the action.
    if (err instanceof UnauthorizedError) {
      return { error: 'Unauthorized' };
    }
    if (err instanceof ForbiddenError) {
      return { error: 'Forbidden' };
    }
    if (
      err &&
      typeof err === 'object' &&
      (err as { status?: number }).status === 403
    ) {
      return { error: 'Forbidden' };
    }
    throw err;
  }
}

export interface UploadState {
  error?: string;
  status?: 'inserted' | 'updated' | 'unchanged';
  chunks?: number;
  fileName?: string;
  documentId?: number;
}

export async function uploadPdfAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { error: 'No PDF uploaded.' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== '%PDF') {
    return { error: 'Only PDF files are supported.' };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { error: 'File too large (max 20 MB).' };
  }
  try {
    const result = await getComposition().uploadPdf({
      fileName: file.name,
      buffer,
      actorId: session.user.id,
    });
    revalidatePath('/admin');
    revalidatePath('/admin/upload');
    revalidatePath('/admin/documents');
    return {
      status: result.status,
      chunks: result.chunks,
      fileName: file.name,
      documentId: result.documentId,
    };
  } catch (err) {
    console.error('uploadPdfAction failed', err);
    return toSafeError(err);
  }
}

export async function deleteDocumentAction(
  documentId: number,
): Promise<{ error?: string }> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    await getComposition().softDeleteDocument({ documentId, actorId: session.user.id });
    revalidatePath('/admin/documents');
    return {};
  } catch (err) {
    console.error('deleteDocumentAction failed', err);
    return toSafeError(err);
  }
}

export async function restoreDocumentAction(
  documentId: number,
): Promise<{ error?: string }> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    const result = await getComposition().restoreDocument(documentId, session.user.id);
    if (!result.ok) {
      return { error: `Restore failed: ${result.reason}` };
    }
    revalidatePath('/admin/documents');
    return {};
  } catch (err) {
    console.error('restoreDocumentAction failed', err);
    return toSafeError(err);
  }
}

export async function hardDeleteDocumentAction(
  documentId: number,
): Promise<{ error?: string }> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    await getComposition().hardDeleteDocument({ documentId, actorId: session.user.id });
    revalidatePath('/admin/documents');
    return {};
  } catch (err) {
    console.error('hardDeleteDocumentAction failed', err);
    return toSafeError(err);
  }
}

export interface SetRoleResult {
  error?: string;
}

export async function setRoleAction(
  clerkUserId: string,
  role: AppRole,
): Promise<SetRoleResult> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  if (role !== 'admin' && role !== 'user') {
    return { error: 'Invalid role' };
  }
  try {
    await getComposition().setUserRole({ clerkUserId, role, actorId: session.user.id });
    revalidatePath('/admin/users');
    return {};
  } catch (err) {
    console.error('setRoleAction failed', err);
    return toSafeError(err);
  }
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  assignedTo?: string | null;
  note?: string;
}

export async function updateTicketAction(
  ticketId: string,
  patch: UpdateTicketInput,
): Promise<{ error?: string }> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    const result = await getComposition().updateTicket({
      ticketId,
      status: patch.status,
      assignedTo: patch.assignedTo,
      note: patch.note,
      actorId: session.user.id,
    });
    if (!result.ok) {
      return { error: `Update failed: ${result.reason ?? 'unknown'}` };
    }
    revalidatePath('/admin/tickets');
    return {};
  } catch (err) {
    console.error('updateTicketAction failed', err);
    return toSafeError(err);
  }
}

export async function impersonateUserAction(
  clerkUserId: string,
): Promise<{ error?: string; url?: string }> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  if (session.user.id === clerkUserId) {
    return { error: 'Cannot impersonate yourself' };
  }
  const comp = getComposition();
  const targetUser = await comp.getUserByClerkId(clerkUserId);
  if (targetUser?.user?.role === 'admin') {
    return { error: 'Cannot impersonate another admin' };
  }
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const signInToken = await client.signInTokens.createSignInToken({
      userId: clerkUserId, expiresInSeconds: 600,
    });
    await getComposition().logTicketEvent({
      action: 'impersonation',
      ticketId: `user:${clerkUserId}`,
      actorId: session.user.id,
    });
    return { url: signInToken.url };
  } catch (err) {
    console.error('impersonateUserAction failed', err);
    return toSafeError(err);
  }
}

export interface RecountChunksResult {
  error?: string;
  count?: number;
}

// Admin-only server action: re-derives the live chunk count for a
// single document from the `chunks` table. Read-only; returns the
// fresh count so the UI can surface it. Revalidates the documents
// page so any cache is cleared even if the displayed count was
// already correct.
export async function recountChunksAction(
  documentId: number,
): Promise<RecountChunksResult> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    const result = await getComposition().recountChunksForDocument(documentId);
    revalidatePath('/admin/documents');
    return { count: result.count };
  } catch (err) {
    console.error('recountChunksAction failed', err);
    return toSafeError(err);
  }
}

export interface RecountAllChunksResult {
  error?: string;
  documents?: number;
  total?: number;
}

// Admin-only server action: re-derives chunk counts for every document
// in the system. Returns summary numbers so the page can render a
// "Recounted N documents, total M chunks" banner. The page reads the
// summary from the `?recounted=...` search param so the message
// survives the page reload that `revalidatePath` triggers.
export async function recountAllChunksAction(): Promise<RecountAllChunksResult> {
  const session = await requireAdminOrError();
  if ('error' in session) return session;
  try {
    const results = await getComposition().recountChunksForAllDocuments();
    const total = results.reduce((acc, r) => acc + r.count, 0);
    revalidatePath('/admin/documents');
    return { documents: results.length, total };
  } catch (err) {
    console.error('recountAllChunksAction failed', err);
    return toSafeError(err);
  }
}


