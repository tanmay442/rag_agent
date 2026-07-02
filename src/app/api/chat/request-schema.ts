// Zod schema for the POST /api/chat request body. Parsed
// at the boundary before any business logic runs so we
// fail fast on malformed input.
import { z } from 'zod';

const MAX_TEXT_LENGTH = 50_000;

const MessagePartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string().max(MAX_TEXT_LENGTH) }),
  z.object({ type: z.string(), text: z.string().max(MAX_TEXT_LENGTH).optional() }).strip(),
]);

export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().optional(),
      // Only user/assistant roles are accepted from the client.
      // System prompts are server-side only — accepting them here
      // would allow prompt injection.
      role: z.enum(['user', 'assistant']),
      parts: z.array(MessagePartSchema),
    }).strip(),
  ).max(100),
});
