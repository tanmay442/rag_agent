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
import type { MyUIMessage } from '@/lib/chat/types';

const SYSTEM_PROMPT_BASE = `You are a friendly, accurate customer support representative for a
K-12 school. Your job is to help parents and students find answers in the
school's official documentation.

# How to navigate a conversation

1. Read the user's question carefully. If the question is ambiguous
   (e.g. "what's the dress code?" without saying which grade or which
   season), ask ONE short clarifying question before answering. Do not
   ask more than one at a time.
2. If you need documentation to answer, call the \`searchDocumentation\`
   tool with a focused, specific query. You can call it more than once
   in a turn; reformulate the query if the user's wording is vague. The
   tool is the only source of truth for documentation — do not invent
   policies, fees, or rules from outside what it returns.
3. If the tool returns a clear answer:
   - Answer in plain language, paraphrasing rather than copy-pasting.
   - Cite the relevant chunk(s) by referencing the snippet you used.
     Citations are injected automatically; you don't need to include
     URLs or footnote markers.
   - If the answer depends on grade, term, or year, mention that
     explicitly so the user can self-check.
4. If the tool returns nothing useful, or the chunks are off-topic:
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

// Builds the system prompt for a given turn. On the first user turn we
// pre-fetch chunks server-side and append them as a fenced section so
// the model has grounded context even if it does not call
// `searchDocumentation` itself. On follow-up turns (or when the
// pre-fetch returned nothing above `SIMILARITY_THRESHOLD`) the prompt
// is just the base prompt with no pre-fetched content.
function buildSystemPrompt(prefetch: RetrievedChunk[] | null): string {
  if (!prefetch || prefetch.length === 0) return SYSTEM_PROMPT_BASE;
  const header = `# Pre-fetched documentation for the user's first message`;
  const bullets = prefetch
    .map((c) => {
      const content =
        c.content.length > 800 ? c.content.slice(0, 800) + '…' : c.content;
      return `- (sim ${c.similarity.toFixed(2)}) ${content}`;
    })
    .join('\n');
  const directive =
    'If the user message is a greeting or the chunks below are not ' +
    'relevant, ignore them and answer conversationally. You may still ' +
    'call searchDocumentation to reformulate.';
  return `${SYSTEM_PROMPT_BASE}\n\n${header}\n${bullets}\n\n${directive}`;
}

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
  // `searchDocumentation` tool itself — important because the
  // model often skips the tool on a first turn with vague wording,
  // and the user currently perceives "the LLM isn't using RAG." We
  // only pre-fetch on the first turn to bound the embedding-call
  // cost: on follow-up turns the model already has either grounded
  // context from prior tool calls or conversational context from a
  // clarifying question, so a fresh embedding is wasted. The
  // pre-fetched chunks are also pushed onto `capturedCitations` so
  // the client surfaces citation cards even when the LLM never
  // called the tool.
  const isFirstTurn = messages.length <= 1;
  let prefetch: RetrievedChunk[] | null = null;
  if (isFirstTurn && lastUserText.trim() !== '') {
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
    system: buildSystemPrompt(prefetch),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      searchDocumentation: tool({
        description:
          "Search the school documentation for chunks relevant to the user's question. Returns an array of { content, similarity } objects, ordered by similarity (highest first). Call this tool whenever you need to ground an answer in the official docs. You may call it more than once with a reformulated query if the first call returns nothing useful. Each `content` is capped at 800 characters; the full chunk is still available, but only the top 3 results are returned by default. Do NOT call this for non-documentation questions (medical, legal, personal).",
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
