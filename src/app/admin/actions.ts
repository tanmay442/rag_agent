'use server';

import { forbidden } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { ingestFile } from '@/lib/rag/ingest';

export interface UploadState {
  error?: string;
  status?: 'inserted' | 'updated' | 'unchanged';
  chunks?: number;
  fileName?: string;
}

export interface RoleState {
  error?: string;
  updatedUserId?: string;
  newRole?: 'admin' | 'user';
}

async function requireAdminOrThrow() {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') {
    forbidden();
  }
  return session;
}

export async function uploadPdfAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await requireAdminOrThrow();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { error: 'No PDF uploaded.' };
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Only PDF files are supported.' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await ingestFile({
      fileName: file.name,
      buffer,
      uploadedBy: session.user.id,
    });
    revalidatePath('/admin/upload');
    return {
      status: result.status,
      chunks: result.chunks,
      fileName: file.name,
    };
  } catch (err) {
    console.error('uploadPdfAction failed', err);
    return { error: (err as Error).message ?? 'Upload failed.' };
  }
}

export async function setRoleAction(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  await requireAdminOrThrow();
  const userId = String(formData.get('userId') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  if (!userId) return { error: 'userId is required' };
  if (role !== 'admin' && role !== 'user') {
    return { error: 'role must be "admin" or "user"' };
  }
  await db.execute(
    sql`UPDATE neon_auth.user SET role = ${role} WHERE id = ${userId}`,
  );
  revalidatePath('/admin/users');
  return { updatedUserId: userId, newRole: role };
}
