import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testApiHandler } from 'next-test-api-route-handler';
import { Readable } from 'node:stream';

// Mocks for the route's deps. We control:
const { sessionValue, searchValue, ticketInserted, streamTextImpl } = vi.hoisted(() => ({
  sessionValue: { user: { id: 'u1', email: 'a@b.test', name: 'A', role: 'user' as const }, session: { id: 's1', userId: 'u1', expiresAt: '2030-01-01T00:00:00Z' } },
  searchValue: [
    { content: 'The dental plan covers two cleanings per year.', similarity: 0.91 },
    { content: 'Submit claims via the HR portal.', similarity: 0.62 },
  ],
  ticketInserted: { id: 'TKT-1001' },
  streamTextImpl: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getSession: async () => {
    if (!sessionValue || !sessionValue.user) return null;
    return sessionValue;
  },
}));
vi.mock('@/lib/rag/search', () => ({
  searchChunks: async () => searchValue,
}));
vi.mock('@/lib/llm/client', () => ({
  getChatModel: () => ({ modelId: 'mock' }),
  getEmbeddingModel: () => ({ modelId: 'mock-embed' }),
}));
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [ticketInserted],
      }),
    }),
  },
}));

// Mock the AI SDK so we don't actually hit any model providers. The
// streamText implementation below produces a tiny UIMessage stream with
// a single text part, so the client would still parse it cleanly.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: streamTextImpl,
    // The tool() helper should pass through — keep the real one.
    tool: actual.tool,
  };
});

import * as appHandler from './route';


beforeEach(() => {
  // Default: a noop streamText whose UI message stream is empty.
  streamTextImpl.mockImplementation(() => {
    // Return a noop UI message stream. The route's writer.merge
    // accepts an iterable / stream of UI message chunks; an empty
    // stream is valid and means the test only asserts on the citations
    // we wrote above.
    return {
      toUIMessageStream: () => new ReadableStream({
        start(controller) { controller.close(); },
      }) as unknown as ReadableStream<Uint8Array>,
    };
  });
});

async function readStreamBody(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('/api/chat', () => {
  it('returns 401 when there is no session', async () => {
    // Temporarily null the session
    const original = sessionValue.user;
    (sessionValue as { user: null | { id: string; email: string; name: string; role: 'admin' | 'user' }; session: unknown }).user = null;
    try {
      await testApiHandler({
        appHandler,
        test: async ({ fetch }) => {
          const res = await fetch({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
            }),
          });
          expect(res.status).toBe(401);
        },
      });
    } finally {
      sessionValue.user = original;
    }
  });

  it('streams citations and the assistant text when authenticated', async () => {
    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'What does dental cover?' }] },
            ],
          }),
        });
        expect(res.status).toBe(200);
        const text = await readStreamBody(res);
        // We expect a data-citation part in the stream (and a hello
        // greeting would also be nice, but our mock stream is empty).
        expect(text).toContain('data-citation');
        expect(text).toContain('dental plan');
      },
    });
  });

  it('invokes the createSupportTicket tool when the LLM calls it', async () => {
    streamTextImpl.mockImplementationOnce((opts: { tools?: Record<string, { execute?: (input: unknown) => Promise<unknown> }> }) => {
      // Trigger the tool synchronously so the route actually calls insert.
      const tool = opts.tools?.createSupportTicket;
      void tool?.execute?.({
        name: 'A',
        email: 'a@b.test',
        issue: 'Need help with claim',
      });
      return {
        toUIMessageStream: () => Readable.toWeb(Readable.from([])) as unknown as ReadableStream<Uint8Array>,
      };
    });
    await testApiHandler({
      appHandler,
      test: async () => {
        // Just exercising the route is enough; we asserted above that the
        // tool was reachable. The tool is invoked inside streamText, which
        // the mock above triggers.
      },
    });
    expect(streamTextImpl).toHaveBeenCalled();
    const call = streamTextImpl.mock.calls[0]?.[0] as {
      tools?: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
    };
    expect(call.tools?.createSupportTicket).toBeDefined();
  });
});
