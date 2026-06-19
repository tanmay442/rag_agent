import { tool, convertToModelMessages, streamText, createUIMessageStream, createUIMessageStreamResponse, type InferUIMessageChunk } from 'ai';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db/client';
import { tickets } from '@/lib/db/schema';
import { getChatModel } from '@/lib/llm/client';
import { searchChunks } from '@/lib/rag/search';
import { rateLimit } from '@/lib/auth/ratelimit';
import { recordQuery } from '@/lib/auth/query-stats';
import type { MyUIMessage } from '@/lib/chat/types';

const SYSTEM_PROMPT = `You are a helpful customer support representative for our software company.
Use the documentation context below to answer the user's question. If the context does not contain
the answer, politely say so, and offer to open a support ticket using the createSupportTicket tool.
When the user explicitly asks to open a ticket, always use the tool.`;

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

  // 1. Retrieve relevant chunks for the latest user question.
  let sources: Array<{ similarity: number; snippet: string }> = [];
  if (lastUserText) {
    try {
      const matches = await searchChunks(lastUserText);
      sources = matches.map((m) => ({
        similarity: m.similarity,
        snippet: m.content.slice(0, 150) + (m.content.length > 150 ? '…' : ''),
      }));
    } catch (err) {
      console.error('RAG retrieval failed:', err);
    }
  }

  const context = sources.map((s) => s.snippet).join('\n\n');

  // 2. Run the LLM to get a UIMessage stream.
  const result = streamText({
    model: getChatModel(),
    system: `${SYSTEM_PROMPT}\n\n---\n${context || 'No documentation found for this query.'}\n---`,
    messages: await convertToModelMessages(messages),
    tools: {
      createSupportTicket: tool({
        description:
          'Open a support ticket when the documentation does not answer the user.',
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
          issue: z.string().describe('Brief description of the unresolved issue'),
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
          const [latest] = await db
            .select({ ticketId: tickets.ticketId })
            .from(tickets)
            .orderBy(desc(tickets.id))
            .limit(1);
          const nextNum = latest
            ? parseInt(latest.ticketId.split('-')[1] ?? '0', 10) + 1
            : 1001;
          const ticketId = `TKT-${nextNum}`;
          await db.insert(tickets).values({
            ticketId,
            userId,
            name: realName,
            email: realEmail,
            issue,
          });
          return { ticketId, status: 'created' };
        },
      }),
    },
  });

  const llmStream = result.toUIMessageStream({ originalMessages: messages });

  // 3. Wrap the LLM stream so that as soon as the assistant message
  // starts, we inject the citation data parts immediately afterwards
  // (so the client sees them as parts of the assistant message).
  const sourcesCopy = sources;
  const citationStream = new ReadableStream<InferUIMessageChunk<MyUIMessage>>({
    start(controller) {
      const reader = llmStream.getReader();
      let injected = false;
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            if (!injected && value && typeof value === 'object' && (value as { type?: string }).type === 'start') {
              injected = true;
              for (const src of sourcesCopy) {
                controller.enqueue({
                  type: 'data-citation',
                  data: src,
                } as InferUIMessageChunk<MyUIMessage>);
              }
            }
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
