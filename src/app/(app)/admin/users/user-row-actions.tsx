'use client';

import { useState, useTransition } from 'react';
import { useSession } from '@clerk/nextjs';
import { setRoleAction } from '../actions';

export function UserRowActions({
  clerkUserId,
  role,
}: {
  clerkUserId: string;
  role: 'admin' | 'user';
}) {
  const { session } = useSession();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setMessage(null);
            const next: 'admin' | 'user' = role === 'admin' ? 'user' : 'admin';
            const res = await setRoleAction(clerkUserId, next);
            if (res.error) setError(res.error);
            else {
              await session?.reload();
              setMessage(`Role set to ${next}`);
            }
          })
        }
        className="rounded-xl border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] disabled:opacity-50"
        data-testid={`users-toggle-role-${clerkUserId}`}
      >
        {pending ? '…' : role === 'admin' ? 'Demote' : 'Promote'}
      </button>
      {error ? (
        <span className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </span>
      ) : null}
      {message ? (
        <span className="text-xs text-[var(--success)]" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
