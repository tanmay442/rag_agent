import { tool, convertToModelMessages, streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { tickets } from '@/lib/db/schema';
import { getChatModel } from '@/lib/llm/client';
import { searchChunks } from '@/lib/rag/search';
import type { MyUIMessage } from '@/lib/chat/types';

const SYSTEM_PROMPT = `You are a helpful customer support representative for our software company.
Use the documentation context below to answer the user's question. If the context does not contain
the answer, politely say so, and offer to open a support ticket using the createSupportTicket tool.
When the user explicitly asks to open a ticket, always use the tool.`;

export async function POST(req: Request) {
  // 1. Authn — refuse unauthenticated traffic.
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  const { messages }: { messages: MyUIMessage[] } = await req.json();
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage
    ? lastUserMessage.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
    : '';

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      // 2. Retrieve relevant chunks for the latest user question.
      let context = '';
      let sources: Array<{ similarity: number; snippet: string }> = [];
      if (lastUserText) {
        try {
          const matches = await searchChunks(lastUserText);
          context = matches.map((m) => m.content).join('\n\n');
          sources = matches.map((m) => ({
            similarity: m.similarity,
            snippet: m.content.slice(0, 150) + (m.content.length > 150 ? '…' : ''),
          }));
          for (const src of sources) {
            // 3. Stream each citation as a typed data part so the client
            // can render citation cards without waiting for the answer.
            writer.write({
              type: 'data-citation',
              data: src,
            });
          }
        } catch (err) {
          console.error('RAG retrieval failed:', err);
        }
      }

      // 4. Stream the answer with a tool the LLM can call to escalate.
      const result = streamText({
        model: getChatModel(),
        system: `${SYSTEM_PROMPT}\n\n---\n${context || 'No documentation found for this query.'}\n---`,
        messages: await convertToModelMessages(messages),
        tools: {
          createSupportTicket: tool({
            description:
              'Open a support ticket when the documentation does not answer the user.',
            inputSchema: z.object({
              name: z.string().describe("The user's name"),
              email: z.string().email().describe("The user's email address"),
              issue: z.string().describe('Brief description of the unresolved issue'),
            }),
            execute: async ({ name, email, issue }) => {
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
                name,
                email,
                issue,
              });
              return { ticketId, status: 'created' };
            },
          }),
        },
      });

      writer.merge(result.toUIMessageStream({ originalMessages: messages }));
    },
    originalMessages: messages,
    onFinish: () => {
      // Citations are streamed as typed data parts, so no extra metadata
      // is needed. This hook is reserved for future side-effects.
    },
  });

  return createUIMessageStreamResponse({ stream });
}
