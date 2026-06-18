'use client';

import { useActionState } from 'react';
import { uploadPdfAction, type UploadState } from '../actions';

const initial: UploadState = {};

export default function UploadPage() {
  const [state, formAction, pending] = useActionState(uploadPdfAction, initial);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Upload documentation</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Drop a PDF and we&apos;ll chunk, embed, and index it for RAG search.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="upload-input"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="upload-submit"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {state.error && (
        <div className="rounded bg-red-100 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.status && (
        <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">
          {state.fileName}: {state.status} ({state.chunks} chunks)
        </div>
      )}
    </section>
  );
}
