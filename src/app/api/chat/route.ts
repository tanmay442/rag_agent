import { tool, convertToModelMessages, streamText, stepCountIs, createUIMessageStreamResponse, type InferUIMessageChunk } from 'ai';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db/client';
import { tickets } from '@/lib/db/schema';
import { getChatModel } from '@/lib/llm/client';
import { searchChunks, type RetrievedChunk } from '@/lib/rag/search';
import { rateLimit } from '@/lib/auth/ratelimit';
import { recordQuery } from '@/lib/auth/query-stats';
import { appConfig } from '@/lib/config';
import { buildSystemPrompt } from '@/lib/prompt/build-system-prompt';
import type { MyUIMessage } from '@/lib/chat/types';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const limit = rateLimit(`chat:${userId}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const { messages }: { messages: MyUIMessage[] } = await req.json();
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage
    ? lastUserMessage.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
    : '';

  if (lastUserText) {
    recordQuery(userId, lastUserText);
  }

  // Chunks that produced citations on the assistant message. Two
  // sources can push into this array:
  //   1. The first-turn pre-fetch below, so the client surfaces
  //      citation cards even when the LLM never called
  //      `searchDocumentation` itself.
  //   2. The `searchDocumentation` tool's `execute`, so the LLM's
  //      own reformulations and follow-up searches also surface.
  // The post-stream wrapper emits the array as `data-citation` parts
  // in the order they were pushed. Capped per-chunk so a long
  // retrieval doesn't blow up the citation payload.
  const capturedCitations: Array<{ similarity: number; snippet: string }> = [];
  const CITATION_SNIPPET_MAX = 150;

  // First-turn pre-fetch: when no assistant message has been
  // produced yet in this conversation (i.e. `messages.length <= 1`
  // — the only message is the current user message, or the array
  // is empty in degenerate test/direct-API cases), run
  // `searchChunks` against the user's text and inject the results
  // into the system prompt. This guarantees the model has grounded
  // context even if it does not decide to call the
  // `searchDocumentation` tool itself. We only pre-fetch on the
  // first turn to bound the embedding-call cost: on follow-up turns
  // the model already has either grounded context from prior tool
  // calls or conversational context from a clarifying question, so
  // a fresh embedding is wasted. The pre-fetched chunks are also
  // pushed onto `capturedCitations` so the client surfaces citation
  // cards even when the LLM never called the tool. Gated on
  // `appConfig.prefetchFirstTurn` so deployments can opt out.
  const isFirstTurn = messages.length <= 1;
  let prefetch: RetrievedChunk[] | null = null;
  if (appConfig.prefetchFirstTurn && isFirstTurn && lastUserText.trim() !== '') {
    try {
      prefetch = await searchChunks(lastUserText);
    } catch (err) {
      console.error('First-turn pre-fetch failed:', err);
      prefetch = null;
    }
    if (prefetch) {
      for (const m of prefetch) {
        capturedCitations.push({
          similarity: m.similarity,
          snippet:
            m.content.length > CITATION_SNIPPET_MAX
              ? m.content.slice(0, CITATION_SNIPPET_MAX) + '…'
              : m.content,
        });
      }
    }
  }

  // Run the LLM with a tool-driven RAG loop: the model decides when to
  // call `searchDocumentation` (and how to reformulate vague queries).
  // `stopWhen: stepCountIs(5)` gives the model room for a clarifying
  // question plus a couple of reformulated searches without runaway
  // loops.
  const result = streamText({
    model: getChatModel(),
    system: buildSystemPrompt(appConfig, prefetch),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      searchDocumentation: tool({
        description:
          "Search the org documentation for chunks relevant to the user's question. Returns an array of { content, similarity } objects, ordered by similarity (highest first). Call this tool whenever you need to ground an answer in the official docs. You may call it more than once with a reformulated query if the first call returns nothing useful. Each `content` is capped at 800 characters; the full chunk is still available, but only the top 3 results are returned by default. Do NOT call this for non-documentation questions (medical, legal, personal).",
        inputSchema: z.object({
          query: z
            .string()
            .min(1)
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
          const TOOL_CONTENT_CAP = 800;
          try {
            const matches = await searchChunks(query, { limit });
            const capped = matches.map((m) => ({
              content:
                m.content.length > TOOL_CONTENT_CAP
                  ? m.content.slice(0, TOOL_CONTENT_CAP) + '…'
                  : m.content,
              similarity: m.similarity,
            }));
            for (const m of matches) {
              capturedCitations.push({
                similarity: m.similarity,
                snippet:
                  m.content.length > CITATION_SNIPPET_MAX
                    ? m.content.slice(0, CITATION_SNIPPET_MAX) + '…'
                    : m.content,
              });
            }
            return capped;
          } catch (err) {
            console.error('RAG retrieval failed:', err);
            return [];
          }
        },
      }),
      createSupportTicket: tool({
        description:
          'Open a support ticket. ONLY call this tool when the user has explicitly asked to open one, file one, escalate, talk to a human, or submit a complaint. Do NOT call it just because the RAG context was empty. The `issue` argument should be a self-contained, structured summary an admin can read without the conversation transcript: Question / What was tried / Docs searched / User context.',
        inputSchema: z.object({
          // `name` and `email` are intentionally still on the tool's
          // contract so the LLM can pass them, but the server ignores
          // them in `execute` and overwrites with the signed-in Clerk
          // identity. This avoids the LLM hallucinating identity while
          // keeping the schema stable for future model upgrades.
          name: z
            .string()
            .describe(
              "Ignored by the server — the signed-in user's name is used instead.",
            ),
          email: z
            .string()
            .email()
            .describe(
              "Ignored by the server — the signed-in user's email is used instead.",
            ),
          issue: z
            .string()
            .describe(
              'Structured ticket summary in the form: Question: ...\nWhat was tried: ...\nDocs searched: ...\nUser context: ...',
            ),
        }),
        execute: async ({ issue }) => {
          // Resolve the signed-in Clerk identity. `auth()` already
          // gated this request, so this should never be null in
          // practice — but if it is, we log a warning and fall back
          // to placeholders rather than inserting a row with the
          // LLM-fabricated values.
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
            console.warn(
              'createSupportTicket: currentUser() returned null after auth() succeeded; storing placeholder identity',
            );
            realName = 'Unknown';
            realEmail = '';
          }
          // Generate a unique ticket ID with retry on collision.
          let ticketId = '';
          for (let attempt = 0; attempt < 5; attempt++) {
            const [latest] = await db
              .select({ ticketId: tickets.ticketId })
              .from(tickets)
              .orderBy(desc(tickets.id))
              .limit(1);
            const nextNum = latest
              ? parseInt(latest.ticketId.split('-')[1] ?? '0', 10) + 1
              : 1001;
            ticketId = `TKT-${nextNum}`;
            try {
              await db.insert(tickets).values({
                ticketId,
                userId,
                name: realName,
                email: realEmail,
                issue,
              });
              break;
            } catch (err: unknown) {
              if (
                attempt < 4 &&
                err instanceof Error &&
                err.message.includes('unique')
              ) {
                continue;
              }
              throw err;
            }
          }
          return { ticketId, status: 'created' };
        },
      }),
    },
  });

  const llmStream = result.toUIMessageStream({ originalMessages: messages });

  // Wrap the LLM stream so that captured citations from the
  // `searchDocumentation` tool are emitted as `data-citation` parts
  // on the assistant message. The tool may be called zero, one, or
  // many times during a multi-step turn, and the model can decide to
  // call it late in the stream (e.g. after a clarifying question is
  // answered), so we don't have the citations available when the
  // assistant `start` chunk arrives. Instead, we buffer nothing and
  // append the citations after the LLM's final chunk, just before
  // closing the stream. The client renders them as parts of the
  // assistant message under the same `chat-citation` testid as
  // before.
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
