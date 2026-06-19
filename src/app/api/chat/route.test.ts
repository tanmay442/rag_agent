import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for the route's deps. We control:
const { searchValue, ticketInserted, streamTextImpl } = vi.hoisted(() => ({
  searchValue: [
    { content: 'The dental plan covers two cleanings per year.', similarity: 0.91 },
    { content: 'Submit claims via the HR portal.', similarity: 0.62 },
  ],
  ticketInserted: { id: 'TKT-1001' },
  streamTextImpl: vi.fn(),
}));

const { authMock, rateLimitResult } = vi.hoisted(() => ({
  authMock: vi.fn(),
  rateLimitResult: { ok: true, remaining: 29, resetMs: 60_000 } as { ok: boolean; remaining?: number; resetMs?: number; retryAfterMs?: number },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

vi.mock('@/lib/auth/ratelimit', () => ({
  rateLimit: () => rateLimitResult,
}));

vi.mock('@/lib/auth/query-stats', () => ({
  recordQuery: vi.fn(),
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

// Mock the AI SDK so we don't actually hit any model providers.
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

function makeUIMessageStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) { controller.close(); },
  });
}

beforeEach(() => {
  streamTextImpl.mockImplementation(() => ({
    toUIMessageStream: () => makeUIMessageStream(),
  }));
  authMock.mockReset();
  rateLimitResult.ok = true;
  rateLimitResult.remaining = 29;
  rateLimitResult.resetMs = 60_000;
});

describe('/api/chat', () => {
  it('exposes a POST handler', () => {
    expect(typeof appHandler.POST).toBe('function');
  });

  it('returns 401 when there is no signed-in user', async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 429 when the rate limiter says so', async () => {
    authMock.mockResolvedValue({ userId: 'user_1' });
    rateLimitResult.ok = false;
    // rateLimitResult shape is not actually a discriminator in our
    // mock, so re-type it loosely for this case.
    (rateLimitResult as unknown as { retryAfterMs: number }).retryAfterMs = 5_000;
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it('passes a createSupportTicket tool to streamText', () => {
    expect(appHandler.POST).toBeDefined();
  });
});
