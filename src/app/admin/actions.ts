'use server';

import { forbidden } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/server';
import { ingestFile } from '@/lib/rag/ingest';

export interface UploadState {
  error?: string;
  status?: 'inserted' | 'updated' | 'unchanged';
  chunks?: number;
  fileName?: string;
}

export async function uploadPdfAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') {
    forbidden();
  }
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
