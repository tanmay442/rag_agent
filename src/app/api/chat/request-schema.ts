// Effect Schema for the POST /api/chat request body. Parsed
// at the boundary before any business logic runs so we
// fail fast on malformed input.
//
// Replaces the previous Zod schema. `decodeUnknown` strips unknown
// properties by default (matching Zod's `.strip()`). A zod-compatible
// `safeParse` surface is kept so the route handler call site is
// unchanged.
import { Schema, Either } from 'effect';

const MAX_TEXT_LENGTH = 50_000;

const ACCEPTED_PART_TYPES = [
  'text',
  'tool-invocation',
  'step-start',
  'step-finish',
  'source',
] as const;

const TextPart = Schema.Struct({
  type: Schema.Literal('text'),
  text: Schema.String.pipe(Schema.maxLength(MAX_TEXT_LENGTH)),
});

const OtherPart = Schema.Struct({
  type: Schema.Literal(...ACCEPTED_PART_TYPES),
  text: Schema.optional(Schema.String.pipe(Schema.maxLength(MAX_TEXT_LENGTH))),
});

const MessagePartSchema = Schema.Union(TextPart, OtherPart);

const ChatMessageSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  // Only user/assistant roles are accepted from the client.
  // System prompts are server-side only — accepting them here
  // would allow prompt injection.
  role: Schema.Literal('user', 'assistant'),
  parts: Schema.Array(MessagePartSchema),
});

export const ChatRequestSchema = Schema.Struct({
  messages: Schema.Array(ChatMessageSchema).pipe(
    Schema.filter((arr) => arr.length <= 100, {
      message: () => 'Too many messages (max 100)',
    }),
  ),
});

type Issue = { path: (string | number)[]; message: string };
type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; error: { issues: Issue[] } };
type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function toIssues(error: unknown): Issue[] {
  const message = error instanceof Error ? error.message : String(error);
  return [{ path: [], message }];
}

const decode = Schema.decodeUnknownEither(ChatRequestSchema);

/** Zod-compatible safe parse: never throws. */
export function safeParse(
  input: unknown,
): ParseResult<Schema.Schema.Type<typeof ChatRequestSchema>> {
  const result = decode(input);
  return Either.isRight(result)
    ? { success: true, data: result.right }
    : { success: false, error: { issues: toIssues(result.left) } };
}
