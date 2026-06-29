// Zod schema for the POST /api/chat request body. Parsed
// at the boundary before any business logic runs so we
// fail fast on malformed input.
import { z } from 'zod';

const MessagePartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.string(), text: z.string().optional() }).strip(),
]);

export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().optional(),
      role: z.enum(['user', 'assistant', 'system']),
      parts: z.array(MessagePartSchema),
    }).strip(),
  ).max(100),
});
