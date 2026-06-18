'use client';

import { useActionState } from 'react';
import { setRoleAction, type RoleState } from '../actions';

const initial: RoleState = {};

export function RoleToggle({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: 'admin' | 'user';
}) {
  const [state, formAction, pending] = useActionState(setRoleAction, initial);
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={newRole} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? '…' : currentRole === 'admin' ? 'Demote' : 'Promote'}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
