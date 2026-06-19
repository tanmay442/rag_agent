'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, type FormEvent } from 'react';
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

  const isStreaming = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        data-testid="chat-messages"
      >
        {messages.length === 0 && (
          <div
            className="flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300"
            data-testid="chat-intro"
          >
            <div className="rounded bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Hi! I&apos;m the support assistant for the school.
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                I can answer questions about school policies, schedules, fees,
                exams, transport, the parent portal, and co-curricular
                activities. I&apos;ll search the official documentation and
                show you the sources I used.
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                If I can&apos;t find an answer, just say{' '}
                <em>open a ticket</em> or <em>talk to a human</em> and I&apos;ll
                file one for you.
              </p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {m.role === 'user' ? 'You' : 'Support'}
            </div>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div
                    key={i}
                    className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm dark:bg-zinc-900"
                    data-testid="chat-text"
                  >
                    {part.text}
                  </div>
                );
              }
              if (part.type === 'data-citation') {
                return (
                  <div
                    key={i}
                    className="rounded border border-zinc-200 bg-white p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    data-testid="chat-citation"
                  >
                    <div className="font-medium text-zinc-700 dark:text-zinc-200">
                      Citation (similarity {part.data.similarity.toFixed(2)})
                    </div>
                    <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                      {part.data.snippet}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {isStreaming && (
          <button
            type="button"
            onClick={() => stop()}
            className="self-start rounded bg-zinc-200 px-3 py-1 text-xs hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Stop
          </button>
        )}
        {error && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            Something went wrong.
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          placeholder="Type your question…"
          className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="chat-send"
        >
          Send
        </button>
      </form>
    </div>
  );
}
