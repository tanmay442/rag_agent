'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MyUIMessage } from '@/lib/chat/types';

export function ChatInterface() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error, stop } = useChat<MyUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter sends; Shift+Enter is a no-op (single-line input) so the
    // press is treated as a send rather than swallowing it. This is a
    // small UX win for chat: hit Enter to send.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent<HTMLFormElement>);
    }
  };

  const isStreaming = status === 'submitted' || status === 'streaming';

  // Auto-scroll: the messages container is the only vertically
  // scrollable region in the chat frame (the form is pinned to the
  // bottom of the flex column, the page itself does not scroll). On
  // every change to `messages` (new text part, citation, or new
  // message appended) and on every status transition (so we keep up
  // with streaming token deltas), scroll the container to the bottom
  // so the user's eye is on the latest reply. We use `scrollTop =`
  // instead of `Element.scrollIntoView` to avoid scrolling the
  // whole page on long threads, and we skip the smooth behavior
  // during streaming to keep up with rapid token deltas.
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div
        ref={messagesScrollRef}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]/40 p-3 sm:p-5"
        data-testid="chat-messages"
      >
        {messages.length === 0 && (
          <div
            className="m-auto flex max-w-md flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]/60 p-5 text-sm text-[var(--foreground-muted)]"
            data-testid="chat-intro"
          >
            <div className="flex items-center gap-2 text-[var(--foreground)]">
              <span
                aria-hidden
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M4 4h16v12H7l-3 4V4z" />
                </svg>
              </span>
              <p className="font-medium">Hi! I&apos;m the support assistant for the school.</p>
            </div>
            <p>
              I can answer questions about school policies, schedules, fees,
              exams, transport, the parent portal, and co-curricular activities.
              I&apos;ll search the official documentation and show you the
              sources I used.
            </p>
            <p>
              If I can&apos;t find an answer, just say{' '}
              <em className="not-italic text-[var(--foreground)]">
                open a ticket
              </em>{' '}
              or{' '}
              <em className="not-italic text-[var(--foreground)]">
                talk to a human
              </em>{' '}
              and I&apos;ll file one for you.
            </p>
          </div>
        )}
        {messages.map((m) => {
          // Group consecutive text/data parts on the same side. The
          // citation parts are pulled out into their own rail docked
          // against the AI bubble; this keeps the bubble itself
          // compact and lets users scan sources at a glance.
          const isUser = m.role === 'user';
          const textParts = m.parts.filter(
            (p) => p.type === 'text' || p.type === 'data-citation',
          );
          const citations = m.parts.filter(
            (p) => p.type === 'data-citation',
          ) as Array<{
            type: 'data-citation';
            data: { similarity: number; snippet: string };
          }>;
          return (
            <div
              key={m.id}
              className={
                isUser
                  ? 'flex flex-col items-end gap-2'
                  : 'flex flex-col items-start gap-2'
              }
            >
              {textParts.map((part, i) => {
                if (part.type === 'text') {
                  return isUser ? (
                    <div
                      key={i}
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-foreground)] shadow-sm"
                      data-testid="chat-text"
                    >
                      {part.text}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] shadow-sm"
                      data-testid="chat-text"
                    >
                      {part.text}
                    </div>
                  );
                }
                return null;
              })}
              {citations.length > 0 && !isUser && (
                <div
                  className="-mx-1 flex max-w-full snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
                  data-testid="chat-citations"
                >
                  {citations.map((c, i) => (
                    <div
                      key={i}
                      className="w-64 shrink-0 snap-start rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/80 p-3 shadow-sm"
                      data-testid="chat-citation"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
                          Source
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                          title="Cosine similarity to your question"
                        >
                          similarity {c.data.similarity.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-[var(--foreground-muted)]">
                        {c.data.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isStreaming && (
          <div className="flex items-center gap-2 self-start text-xs text-[var(--foreground-subtle)]">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--foreground-subtle)] [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--foreground-subtle)] [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--foreground-subtle)]" />
            </span>
            <button
              type="button"
              onClick={() => stop()}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]"
            >
              Stop
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
            Something went wrong.
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-1.5 shadow-lg shadow-black/20 backdrop-blur-md transition-shadow focus-within:border-[var(--accent)]/60 focus-within:shadow-[var(--accent)]/10"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isStreaming}
          placeholder="Type your question…"
          className="min-h-[44px] flex-1 rounded-xl bg-transparent px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none disabled:opacity-60"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="inline-flex h-[44px] items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] transition-all hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="chat-send"
        >
          Send
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
