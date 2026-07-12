'use client';

import { useActionState } from 'react';
import { reingestAction, type ReingestResult } from '../actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const initial: ReingestResult = {};

export function ReingestForm() {
  const [state, formAction, pending] = useActionState(reingestAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        This re-chunks and re-embeds every document in the corpus with the
        current strategy. It can take a while and temporarily increases load,
        so run it only after changing the chunking strategy in config.
      </p>
      <Button
        type="submit"
        disabled={pending}
        data-testid="reingest-submit"
      >
        {pending ? 'Re-ingesting…' : 'Re-ingest all documents'}
      </Button>
      {state.error ? (
        <Alert variant="destructive" data-testid="reingest-error" role="alert">
          {state.error}
        </Alert>
      ) : null}
      {state.processed !== undefined ? (
        <Alert
          className="border-border-subtle bg-secondary px-3 py-2 text-foreground"
          data-testid="reingest-success"
          role="status"
        >
          Re-ingested {state.processed} document
          {state.processed === 1 ? '' : 's'}, {state.chunks} chunk
          {state.chunks === 1 ? '' : 's'}
          {state.failed ? `, ${state.failed} failed` : ''}.
        </Alert>
      ) : null}
    </form>
  );
}
