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

const SYSTEM_PROMPT = `You are a friendly, accurate customer support representative for a
K-12 school. Your job is to help parents and students find answers in the
school's official documentation.

# How to navigate a conversation

1. Read the user's question carefully. If the question is ambiguous
   (e.g. "what's the dress code?" without saying which grade or which
   season), ask ONE short clarifying question before answering. Do not
   ask more than one at a time.
2. Look at the documentation context provided under the \`--- CONTEXT ---\`
   section. Prefer context that has a higher similarity score — those
   are the chunks closest to the user's question.
3. If the context contains a clear answer:
   - Answer in plain language, paraphrasing rather than copy-pasting.
   - Cite the relevant chunk(s) by referencing the snippet you used.
     Citations are injected automatically; you don't need to include
     URLs or footnote markers.
   - If the answer depends on grade, term, or year, mention that
     explicitly so the user can self-check.
4. If the context does NOT contain a clear answer:
   - Say so honestly. Never invent a policy, fee, schedule, or rule.
   - Suggest one specific thing the user could check (a page of the
     handbook, the parent portal, the front office).
   - Do NOT open a support ticket on your own. Offer to open one and
     let the user say yes. Tickets are the user's decision, not yours.
5. If the user asks something outside the scope of the school docs
   (medical, legal, personal), decline politely and suggest they
   contact the appropriate office directly. Do not make up an answer.

# Support tickets — the rules

- ONLY call the createSupportTicket tool when the user has explicitly
  asked for one. Phrases that count as explicit:
  "open a ticket", "file a ticket", "I need to talk to a human",
  "can someone call me", "escalate this", "submit a complaint",
  "raise a support request", and similar.
- Phrases that DO NOT count: "this didn't help", "I'm still stuck",
  "what do I do?", "I need help". In those cases, answer or
  clarify — don't generate a ticket without being asked.
- When you do call the tool, the \`issue\` field should be a tight,
  self-contained summary an admin can read without scrolling back
  through the conversation. Use this structure:
    Question: <what the user actually wanted to know>
    What was tried: <the searches / clarifying questions already done>
    Docs searched: <top snippets you looked at, with their similarity>
    User context: <grade, term, or other info the user volunteered>
  The tool's \`name\` and \`email\` fields are ignored — the server
  stamps them from the signed-in account. Just pass a short
  placeholder string for those.

# Tone

- Friendly, calm, and direct. No emojis. No exclamation marks.
- Keep replies to a few sentences unless the user asked for a long
  explanation.
- If the user is frustrated, acknowledge it once and then focus on
  what you can do, not on apologies.`;

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
