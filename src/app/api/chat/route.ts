import { tool, convertToModelMessages, streamText, stepCountIs, createUIMessageStreamResponse, type InferUIMessageChunk } from 'ai';
import { z } from 'zod';
import { auth, currentUser } from '@clerk/nextjs/server';
import { randomUUID } from 'node:crypto';
import { getComposition, appConfig, type MyUIMessage, type Composition } from '@/composition';
import type { RetrievedChunk } from '@app/application/rag/search';
import { buildSystemPrompt } from '@app/application/prompt/build-system-prompt';
import { NextResponse } from 'next/server';
import { ChatRequestSchema } from './request-schema';
import { sanitizeText } from '@/lib/sanitize';
import { CITATION_SNIPPET_MAX, TOOL_CONTENT_CAP, CHAT_RATE_LIMIT } from '../../../../config/constants';
import { logger } from '@/lib/logger';

function emitCitations(
  chunks: RetrievedChunk[],
  snippetMax = CITATION_SNIPPET_MAX,
): Array<{ similarity: number; snippet: string }> {
  return chunks.map((m) => ({
    similarity: m.similarity,
    snippet:
      m.content.length > snippetMax
        ? m.content.slice(0, snippetMax) + '\u2026'
        : m.content,
  }));
}

function buildChatTools(deps: {
  searchChunks: Composition['searchChunks'];
  capturedCitations: Array<{ similarity: number; snippet: string }>;
  db: Composition['db'];
  schema: Composition['schema'];
  userId: string;
}) {
  const { searchChunks: searchFn, capturedCitations: citationTarget, db, schema, userId: uid } = deps;
  return {
    searchDocumentation: tool({
      description:
        "Search the org documentation for chunks relevant to the user's question. Returns an array of { content, similarity } objects, ordered by similarity (highest first). Call this tool whenever you need to ground an answer in the official docs. You may call it more than once with a reformulated query if the first call returns nothing useful. Each `content` is capped at 800 characters; the full chunk is still available, but only the top 3 results are returned by default. Do NOT call this for non-documentation questions (medical, legal, personal).",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            'A focused, specific search query. Reformulate vague user wording into a tight phrase (e.g. "school cell phone policy" instead of "phones").',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe(
            'Maximum number of chunks to return. Defaults to 3. Use a larger value only if the first call returned nothing useful.',
          ),
      }),
      execute: async ({ query, limit }) => {
        try {
          const matches = await searchFn(query, { limit });
          const capped = matches.map((m) => ({
            content:
              m.content.length > TOOL_CONTENT_CAP
                ? m.content.slice(0, TOOL_CONTENT_CAP) + '\u2026'
                : m.content,
            similarity: m.similarity,
          }));
          for (const citation of emitCitations(matches)) {
            citationTarget.push(citation);
          }
          return capped;
        } catch (err) {
          logger.error('RAG retrieval failed', { error: String(err) });
          return [];
        }
      },
    }),
    createSupportTicket: tool({
      description:
        'Open a support ticket. ONLY call this tool when the user has explicitly asked to open one, file one, escalate, talk to a human, or submit a complaint. Do NOT call it just because the RAG context was empty. The `issue` argument should be a self-contained, structured summary an admin can read without the conversation transcript: Question / What was tried / Docs searched / User context.',
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Ignored by the server \u2014 the signed-in user's name is used instead.",
          ),
        email: z
          .string()
          .email()
          .describe(
            "Ignored by the server \u2014 the signed-in user's email is used instead.",
          ),
        issue: z
          .string()
          .max(10_000)
          .describe(
            'Structured ticket summary in the form: Question: ...\nWhat was tried: ...\nDocs searched: ...\nUser context: ...',
          ),
      }),
      execute: async ({ issue }) => {
        const clerkUser = await currentUser();
        let realName: string;
        let realEmail: string;
        if (clerkUser) {
          realName =
            clerkUser.fullName ??
            clerkUser.firstName ??
            clerkUser.username ??
            'User';
          realEmail = clerkUser.emailAddresses[0]?.emailAddress ?? '';
        } else {
          logger.warn('createSupportTicket: currentUser() returned null after auth() succeeded');
          realName = 'Unknown';
          realEmail = '';
        }
        const ticketId = `TKT-${randomUUID().slice(0, 8)}`;
        await db.insert(schema.tickets).values({
          ticketId,
          userId: uid,
          name: realName,
          email: realEmail,
          issue: sanitizeText(issue),
        });
        return { ticketId, status: 'created' };
      },
    }),
  };
}

async function streamChatResponse(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const contentType = req.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return new Response('Content-Type must be application/json', { status: 415 });
  }
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > 1_000_000) {
    return new Response('Request body too large', { status: 413 });
  }
  const comp = getComposition();
  const limit = comp.rateLimit(`chat:${userId}`, CHAT_RATE_LIMIT);
  if (!limit.ok) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const raw = await req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
  }
  const messages = parsed.data.messages as unknown as MyUIMessage[];
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage
    ? lastUserMessage.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
    : '';

  if (lastUserText) {
    comp.recordQuery(userId, lastUserText);
  }

  const capturedCitations: Array<{ similarity: number; snippet: string }> = [];

  const isFirstTurn = messages.length <= 1;
  let prefetch: RetrievedChunk[] | null = null;
  if (appConfig.prefetchFirstTurn && isFirstTurn && lastUserText.trim() !== '') {
    try {
      prefetch = await comp.searchChunks(lastUserText, {});
    } catch (err) {
      logger.error('First-turn pre-fetch failed', { error: String(err) });
      prefetch = null;
    }
    if (prefetch) {
      for (const citation of emitCitations(prefetch)) {
        capturedCitations.push(citation);
      }
    }
  }

  const result = streamText({
    model: comp.getChatModel(),
    system: buildSystemPrompt(appConfig, prefetch),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    tools: buildChatTools({
      searchChunks: comp.searchChunks,
      capturedCitations,
      db: comp.db,
      schema: comp.schema,
      userId,
    }),
  });

  const llmStream = result.toUIMessageStream({ originalMessages: messages });

  const citationStream = new ReadableStream<InferUIMessageChunk<MyUIMessage>>({
    start(controller) {
      const reader = llmStream.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          for (const src of capturedCitations) {
            controller.enqueue({
              type: 'data-citation',
              data: src,
            } as InferUIMessageChunk<MyUIMessage>);
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      })();
    },
  });

  return createUIMessageStreamResponse({ stream: citationStream });
}

export async function POST(req: Request) {
  return streamChatResponse(req);
}
