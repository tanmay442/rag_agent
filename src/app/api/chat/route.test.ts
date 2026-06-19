import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for the route's deps. We control:
const { searchValue, ticketInserted, ticketInsertedValues, streamTextImpl } = vi.hoisted(() => ({
  searchValue: [
    { content: 'The dental plan covers two cleanings per year.', similarity: 0.91 },
    { content: 'Submit claims via the HR portal.', similarity: 0.62 },
  ],
  ticketInserted: { id: 'TKT-1001' },
  ticketInsertedValues: [] as Array<Record<string, unknown>>,
  streamTextImpl: vi.fn(),
}));

const { authMock, rateLimitResult } = vi.hoisted(() => ({
  authMock: vi.fn(),
  rateLimitResult: { ok: true, remaining: 29, resetMs: 60_000 } as { ok: boolean; remaining?: number; resetMs?: number; retryAfterMs?: number },
}));

const { currentUserMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  currentUser: currentUserMock,
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
      values: (v: Record<string, unknown>) => {
        ticketInsertedValues.push(v);
        return {
          returning: async () => [ticketInserted],
        };
      },
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
  currentUserMock.mockReset();
  ticketInsertedValues.length = 0;
  // Default Clerk identity: every test gets a known user unless it
  // explicitly overrides the mock.
  currentUserMock.mockResolvedValue({
    id: 'user_test',
    emailAddresses: [{ emailAddress: 'real@example.com' }],
    fullName: 'Real Person',
    firstName: 'Real',
    username: 'realperson',
  });
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

describe('/api/chat createSupportTicket tool', () => {
  async function invokeToolFromStreamText(overrides: {
    name: string;
    email: string;
    issue: string;
  }) {
    authMock.mockResolvedValue({ userId: 'user_test' });
    let capturedTools:
      | {
          createSupportTicket: {
            execute: (args: {
              name: string;
              email: string;
              issue: string;
            }) => Promise<unknown>;
          };
        }
      | undefined;
    streamTextImpl.mockImplementation((opts: { tools?: unknown }) => {
      capturedTools = opts?.tools as typeof capturedTools;
      return { toUIMessageStream: () => makeUIMessageStream() };
    });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(streamTextImpl).toHaveBeenCalled();
    const tool = capturedTools?.createSupportTicket;
    expect(tool).toBeDefined();
    await tool?.execute(overrides);
    return ticketInsertedValues[ticketInsertedValues.length - 1];
  }

  it('overrides the LLM-provided name/email with the Clerk currentUser() identity', async () => {
    const inserted = await invokeToolFromStreamText({
      name: 'User',
      email: 'user@example.com',
      issue: 'Something is broken',
    });
    expect(inserted).toEqual(
      expect.objectContaining({
        ticketId: 'TKT-1001',
        userId: 'user_test',
        name: 'Real Person',
        email: 'real@example.com',
        issue: 'Something is broken',
      }),
    );
  });

  it('falls back to placeholder identity when currentUser() is null', async () => {
    currentUserMock.mockResolvedValue(null);
    const inserted = await invokeToolFromStreamText({
      name: 'User',
      email: 'user@example.com',
      issue: 'Something is broken',
    });
    expect(inserted).toEqual(
      expect.objectContaining({
        userId: 'user_test',
        name: 'Unknown',
        email: '',
      }),
    );
  });
});


describe('/api/chat searchDocumentation tool', () => {
  async function captureTools() {
    authMock.mockResolvedValue({ userId: 'user_test' });
    let captured:
      | {
          searchDocumentation?: {
            execute: (args: { query: string; limit?: number }) => Promise<unknown>;
          };
          createSupportTicket?: unknown;
        }
      | undefined;
    let capturedStopWhen: unknown;
    streamTextImpl.mockImplementation((opts: { tools?: unknown; stopWhen?: unknown }) => {
      captured = opts?.tools as typeof captured;
      capturedStopWhen = opts?.stopWhen;
      return { toUIMessageStream: () => makeUIMessageStream() };
    });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(streamTextImpl).toHaveBeenCalled();
    return { tools: captured, stopWhen: capturedStopWhen };
  }

  it('passes a searchDocumentation tool to streamText', async () => {
    const { tools } = await captureTools();
    expect(tools?.searchDocumentation).toBeDefined();
    // The support-ticket tool still exists alongside.
    expect(tools?.createSupportTicket).toBeDefined();
  });

  it('passes a stopWhen condition (multi-step) to streamText', async () => {
    const { stopWhen } = await captureTools();
    expect(stopWhen).toBeDefined();
  });

  it('returns searchChunks-shaped results from the tool, capping long content', async () => {
    const { tools } = await captureTools();
    const tool = tools?.searchDocumentation;
    expect(tool).toBeDefined();
    const result = (await tool!.execute({ query: 'cell phone policy' })) as Array<{
      content: string;
      similarity: number;
    }>;
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      { content: 'The dental plan covers two cleanings per year.', similarity: 0.91 },
      { content: 'Submit claims via the HR portal.', similarity: 0.62 },
    ]);
  });

  it('caps per-chunk content returned to the model at 800 chars', async () => {
    const longContent = 'x'.repeat(2_000);
    const longMock = [
      { content: longContent, similarity: 0.9 },
    ];
    // Override searchChunks for this test only.
    const searchChunksSpy = vi.spyOn(
      await import('@/lib/rag/search'),
      'searchChunks',
    );
    searchChunksSpy.mockResolvedValueOnce(longMock);

    authMock.mockResolvedValue({ userId: 'user_test' });
    let capturedTools:
      | {
          searchDocumentation: {
            execute: (args: { query: string; limit?: number }) => Promise<unknown>;
          };
        }
      | undefined;
    streamTextImpl.mockImplementation((opts: { tools?: unknown }) => {
      capturedTools = opts?.tools as typeof capturedTools;
      return { toUIMessageStream: () => makeUIMessageStream() };
    });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(200);
    const tool = capturedTools?.searchDocumentation;
    expect(tool).toBeDefined();
    const result = (await tool!.execute({ query: 'q' })) as Array<{
      content: string;
      similarity: number;
    }>;
    expect(result[0]?.content.length).toBe(800 + 1); // 800 chars + ellipsis
    expect(result[0]?.content.endsWith('\u2026') || result[0]?.content.endsWith('\u2026')).toBe(true);
    searchChunksSpy.mockRestore();
  });

  it('passes a user-supplied limit through to searchChunks', async () => {
    const searchChunksSpy = vi.spyOn(
      await import('@/lib/rag/search'),
      'searchChunks',
    );
    searchChunksSpy.mockResolvedValueOnce([]);

    const { tools } = await captureTools();
    await tools?.searchDocumentation?.execute({ query: 'q', limit: 5 });
    expect(searchChunksSpy).toHaveBeenCalledWith('q', { limit: 5 });
    searchChunksSpy.mockRestore();
  });

  it('emits captured citations as data-citation parts after the LLM stream ends', async () => {
    authMock.mockResolvedValue({ userId: 'user_test' });
    // The LLM stream emits nothing and stays open until the test
    // closes it. This gives the test a chance to call the tool
    // (which pushes citations into the captured array) *before* the
    // wrapper exits its read loop, so the post-loop citation
    // emission sees the captured chunks.
    type Ctl = ReadableStreamDefaultController<{ type: string }>;
    let streamController: Ctl | null = null;
    const llmStream = new ReadableStream<{ type: string }>({
      start(controller) {
        streamController = controller;
      },
    });
    let capturedTools:
      | {
          searchDocumentation: {
            execute: (args: { query: string; limit?: number }) => Promise<unknown>;
          };
        }
      | undefined;
    streamTextImpl.mockImplementation((opts: { tools?: unknown }) => {
      capturedTools = opts?.tools as typeof capturedTools;
      return {
        toUIMessageStream: () => llmStream as unknown as ReadableStream<Uint8Array>,
      };
    });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(res.status).toBe(200);
    // Call the tool so it pushes citations into the captured array.
    await capturedTools?.searchDocumentation.execute({ query: 'q' });
    // Now close the LLM stream so the wrapper's read loop exits
    // and it enqueues the captured citations before closing the
    // response stream.
    streamController!.close();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    expect(body).toMatch(/data-citation/);
    expect(body).toMatch(/0\.91/);
    expect(body).toMatch(/dental plan/);
  });
});

describe('/api/chat first-turn pre-fetch', () => {
  // Captures the `system` argument passed to streamText for a given
  // body. The LLM stream is a no-op so we can read the captured
  // argument synchronously after the request resolves.
  async function captureSystemForBody(body: { messages: unknown[] }) {
    authMock.mockResolvedValue({ userId: 'user_test' });
    let capturedSystem: unknown;
    streamTextImpl.mockImplementation((opts: { system?: unknown }) => {
      capturedSystem = opts?.system;
      return { toUIMessageStream: () => makeUIMessageStream() };
    });
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    return { system: capturedSystem, res };
  }

  it('does not inject a pre-fetch header on a first turn with empty lastUserText', async () => {
    const { system } = await captureSystemForBody({ messages: [] });
    expect(typeof system).toBe('string');
    expect(system as string).not.toMatch(/Pre-fetched documentation/);
  });

  it('injects pre-fetched chunks into the system prompt on the first turn', async () => {
    const { system } = await captureSystemForBody({
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'dress code grade 6' }],
        },
      ],
    });
    expect(typeof system).toBe('string');
    const sys = system as string;
    expect(sys).toMatch(/Pre-fetched documentation/);
    // The searchValue fixture has two distinct contents; both should
    // appear in the pre-fetched bullet list.
    expect(sys).toContain('The dental plan covers two cleanings per year.');
    expect(sys).toContain('Submit claims via the HR portal.');
    // Similarities from the fixture (0.91, 0.62) should also surface.
    expect(sys).toMatch(/sim 0\.91/);
    expect(sys).toMatch(/sim 0\.62/);
  });

  it('emits pre-fetched chunks as data-citation parts even when the LLM never calls the tool', async () => {
    authMock.mockResolvedValue({ userId: 'user_test' });
    // The LLM stream emits nothing. We do NOT call the tool, so the
    // only citations in the captured array come from the first-turn
    // pre-fetch.
    type Ctl = ReadableStreamDefaultController<{ type: string }>;
    let streamController: Ctl | null = null;
    const llmStream = new ReadableStream<{ type: string }>({
      start(controller) {
        streamController = controller;
      },
    });
    streamTextImpl.mockImplementation(() => ({
      toUIMessageStream: () => llmStream as unknown as ReadableStream<Uint8Array>,
    }));
    const res = await appHandler.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            {
              id: 'm1',
              role: 'user',
              parts: [{ type: 'text', text: 'dress code grade 6' }],
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    // Close the LLM stream so the wrapper's read loop exits and the
    // captured citations are enqueued.
    streamController!.close();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    expect(body).toMatch(/data-citation/);
    expect(body).toMatch(/dental plan/);
    expect(body).toMatch(/Submit claims via the HR portal/);
    expect(body).toMatch(/0\.91/);
  });

  it('does not pre-fetch on a follow-up turn (messages.length > 0)', async () => {
    const { system } = await captureSystemForBody({
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi! What can I help with?' }],
        },
        {
          id: 'u2',
          role: 'user',
          parts: [{ type: 'text', text: 'and for grade 7?' }],
        },
      ],
    });
    expect(typeof system).toBe('string');
    // On a follow-up turn the prompt must be the base prompt only —
    // no pre-fetched section, no bullets, no directive.
    expect(system as string).not.toMatch(/Pre-fetched documentation/);
    // The directive line that wraps the pre-fetched section must also
    // be absent.
    expect(system as string).not.toMatch(/ignore them and answer conversationally/);
  });
});

