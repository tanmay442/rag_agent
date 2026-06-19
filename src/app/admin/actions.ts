'use server';

import { revalidatePath } from 'next/cache';
import { DEFAULT_USER_ID } from '@/lib/auth/session';
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
      uploadedBy: DEFAULT_USER_ID,
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
