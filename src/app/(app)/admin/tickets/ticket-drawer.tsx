'use client';

import { useState, useTransition } from 'react';
import { updateTicketAction } from '../actions';
import { VALID_TRANSITIONS, type TicketStatus } from '@app/application/admin/tickets';

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
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm"
      data-testid={`ticket-drawer-body-${ticketId}`}
    >
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
          Name
        </span>
        <div className="mt-0.5 text-[var(--foreground)]">{name}</div>
      </div>
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
          Email
        </span>
        <div className="mt-0.5 text-[var(--foreground)]">{email}</div>
      </div>
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
          Issue
        </span>
        <div className="mt-0.5 whitespace-pre-wrap text-[var(--foreground)]">
          {issue}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            Status
          </span>
          <select
            value={currentStatus}
            onChange={(e) => setCurrentStatus(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
            data-testid={`ticket-status-${ticketId}`}
          >
            <option value={currentStatus}>{currentStatus}</option>
            {VALID_TRANSITIONS[currentStatus as TicketStatus]?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            Assignee
          </span>
          <select
            value={currentAssignee}
            onChange={(e) => setCurrentAssignee(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
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
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          data-testid={`ticket-save-${ticketId}`}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`ticket-note-${ticketId}`}
          className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]"
        >
          Add note
        </label>
        <textarea
          id={`ticket-note-${ticketId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 text-sm text-[var(--foreground)]"
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
          className="self-start rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
          data-testid={`ticket-add-note-${ticketId}`}
        >
          {pending ? 'Posting…' : 'Post note'}
        </button>
      </div>
      {notes ? (
        <div
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
          data-testid={`ticket-notes-${ticketId}`}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            Notes
          </span>
          <pre className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">
            {notes}
          </pre>
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
