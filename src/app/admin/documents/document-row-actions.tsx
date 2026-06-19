'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  deleteDocumentAction,
  restoreDocumentAction,
  hardDeleteDocumentAction,
  recountChunksAction,
} from '../actions';

export function DocumentRowActions({
  id,
  fileName,
  hasBlob,
  isDeleted,
}: {
  id: number;
  fileName: string;
  hasBlob: boolean;
  isDeleted: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recountPending, startRecount] = useTransition();
  const [recountCount, setRecountCount] = useState<number | null>(null);
  const [recountError, setRecountError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasBlob && !isDeleted ? (
        <>
          <Link
            href={`/admin/documents/${id}/preview`}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            data-testid={`documents-preview-${id}`}
          >
            Preview
          </Link>
          <a
            href={`/api/admin/documents/${id}/download`}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            data-testid={`documents-download-${id}`}
          >
            Download
          </a>
        </>
      ) : null}
      {isDeleted ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await restoreDocumentAction(id);
              if (res.error) setError(res.error);
            })
          }
          className="rounded border border-emerald-500 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          data-testid={`documents-restore-${id}`}
        >
          {pending ? 'Restoring…' : 'Restore'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await deleteDocumentAction(id);
              if (res.error) setError(res.error);
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 disabled:opacity-50"
          data-testid={`documents-delete-${id}`}
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
      )}
      {isDeleted ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await hardDeleteDocumentAction(id);
              if (res.error) setError(res.error);
            })
          }
          className="rounded border border-red-500 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          data-testid={`documents-hard-delete-${id}`}
        >
          {pending ? 'Removing…' : 'Hard delete'}
        </button>
      ) : null}
      <button
        type="button"
        disabled={recountPending}
        onClick={() =>
          startRecount(async () => {
            setRecountError(null);
            const res = await recountChunksAction(id);
            if (res.error) {
              setRecountError(res.error);
            } else if (typeof res.count === 'number') {
              setRecountCount(res.count);
            }
          })
        }
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        data-testid={`documents-recount-${id}`}
      >
        {recountPending ? 'Recounting…' : 'Recount chunks'}
      </button>
      {recountCount !== null ? (
        <span
          className="text-xs text-emerald-700"
          data-testid={`documents-recount-result-${id}`}
        >
          → {recountCount}
        </span>
      ) : null}
      {recountError ? (
        <span
          className="text-xs text-red-700"
          role="alert"
          data-testid={`documents-recount-error-${id}`}
        >
          {recountError}
        </span>
      ) : null}
      {error ? (
        <span className="text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
      <span className="sr-only">{fileName}</span>
    </div>
  );
}
