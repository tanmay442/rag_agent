'use client';

import { useState, useTransition } from 'react';
import { updateTicketAction } from '../actions';

export interface UserOption {
  clerkUserId: string;
  email: string;
  name: string | null;
}

export function TicketDrawer({
  ticketId,
  name,
  email,
  issue,
  status,
  assignedTo,
  notes,
  userOptions,
}: {
  ticketId: string;
  name: string;
  email: string;
  issue: string;
  status: string;
  assignedTo: string | null;
  notes: string | null;
  userOptions: UserOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentAssignee, setCurrentAssignee] = useState(assignedTo ?? '');
  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
      data-testid={`ticket-drawer-body-${ticketId}`}
    >
      <div>
        <strong>Name:</strong> {name}
      </div>
      <div>
        <strong>Email:</strong> {email}
      </div>
      <div>
        <strong>Issue:</strong> {issue}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-1">
          <span>Status</span>
          <select
            value={currentStatus}
            onChange={(e) => setCurrentStatus(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            data-testid={`ticket-status-${ticketId}`}
          >
            <option value="created">created</option>
            <option value="in_progress">in_progress</option>
            <option value="closed">closed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>Assignee</span>
          <select
            value={currentAssignee}
            onChange={(e) => setCurrentAssignee(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            data-testid={`ticket-assignee-${ticketId}`}
          >
            <option value="">—</option>
            {userOptions.map((u) => (
              <option key={u.clerkUserId} value={u.clerkUserId}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await updateTicketAction(ticketId, {
                status: currentStatus as 'created' | 'in_progress' | 'closed',
                assignedTo: currentAssignee || null,
              });
              if (res.error) setError(res.error);
            })
          }
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          data-testid={`ticket-save-${ticketId}`}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`ticket-note-${ticketId}`}>Add note</label>
        <textarea
          id={`ticket-note-${ticketId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          data-testid={`ticket-note-${ticketId}`}
        />
        <button
          type="button"
          disabled={pending || note.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await updateTicketAction(ticketId, { note });
              if (res.error) {
                setError(res.error);
              } else {
                setNote('');
              }
            })
          }
          className="self-start rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          data-testid={`ticket-add-note-${ticketId}`}
        >
          {pending ? 'Posting…' : 'Post note'}
        </button>
      </div>
      {notes ? (
        <div
          className="rounded border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          data-testid={`ticket-notes-${ticketId}`}
        >
          <strong>Notes:</strong>
          <pre className="whitespace-pre-wrap">{notes}</pre>
        </div>
      ) : null}
      {error ? (
        <div className="rounded bg-red-100 p-2 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
