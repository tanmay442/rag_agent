'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { recountAllChunksAction } from '../actions';

// Small client component for the page-level "Recount all chunks"
// button. Posts to the server action, then refreshes the page with a
// `?recounted=...` search param that the server component reads to
// render a success banner. The banner survives the page reload so the
// admin gets a visible confirmation even though `revalidatePath`
// triggers a full re-render of the documents table.
export function RecountAllButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setError(null);
          const res = await recountAllChunksAction();
          if (res.error) {
            setError(res.error);
            return;
          }
          // Build a redirect URL that includes the new search params so
          // the page re-renders with the success banner.
          const next = new URLSearchParams(params.toString());
          if (typeof res.documents === 'number') {
            next.set('recountedDocs', String(res.documents));
          }
          if (typeof res.total === 'number') {
            next.set('recountedTotal', String(res.total));
          }
          router.push(`/admin/documents?${next.toString()}`);
        })
      }
      className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      data-testid="documents-recount-all"
    >
      {pending ? 'Recounting…' : 'Recount all chunks'}
    </button>
  );
}
