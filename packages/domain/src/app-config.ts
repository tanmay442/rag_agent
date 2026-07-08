// Single source of truth for the app's runtime configuration.
// `config/app.config.ts` exports a value of this type; the
// loader in src/lib/config/index.ts re-parses it through this
// schema so a malformed config file fails loudly at server
// start instead of producing silently broken prompts.
//
// Moved verbatim from src/lib/config/schema.ts as part of the
// Clean Architecture refactor. Validation now uses Effect Schema
// (Zod removed). A thin zod-compatible `parse`/`safeParse` surface
// is exposed so existing call sites keep working.
import { Schema, Either } from 'effect';

const ToneSchema = Schema.Literal('friendly', 'formal', 'casual', 'concise');

const OutOfScopeTopicSchema = Schema.Struct({
  topic: Schema.String,
  handling: Schema.String,
});

const DEFAULT_OUT_OF_SCOPE_TOPICS = [
  {
    topic: 'security-incident reporting',
    handling:
      'Decline to troubleshoot. Tell the user you are opening a `security-incident` ticket so a security engineer can contact them within 1 business hour. Do not ask for credentials, account details, or any sensitive information in the chat.',
  },
  {
    topic: 'account-takeover claims',
    handling:
      'Decline to investigate. Open a `security-incident` ticket immediately. Do not discuss account state, last-login times, or any account data in the chat.',
  },
  {
    topic: 'refund or chargeback negotiation',
    handling:
      'Decline to negotiate. Open a `billing-dispute` ticket so a billing specialist can review the account. The bot must not promise credits, refunds, or waivers of any kind.',
  },
  {
    topic: 'custom contract terms / DPAs / legal review',
    handling:
      'Decline to draft, interpret, or commit to any custom contractual language. Open a `legal-request` ticket and tell the user a contracts specialist will respond within 2 business days.',
  },
  {
    topic: 'medical',
    handling:
      'Decline politely and suggest they contact a qualified medical professional directly.',
  },
  {
    topic: 'legal',
    handling:
      'Decline politely and suggest they consult a qualified lawyer directly.',
  },
  {
    topic: 'personal advice',
    handling:
      'Decline politely. This assistant is for this product only.',
  },
] as const;

export const AppConfigSchema = Schema.Struct({
  orgName: Schema.optionalWith(Schema.String, { default: () => 'Your Company' }),
  orgShortName: Schema.optionalWith(Schema.String, { default: () => 'RAG Support' }),
  audience: Schema.optionalWith(Schema.String, { default: () => 'your customers' }),
  agentPersona: Schema.optionalWith(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      tone: Schema.optionalWith(ToneSchema, { default: () => 'friendly' as const }),
    }),
    {
      default: () => ({ name: 'Astra', tone: 'friendly' as const }),
    },
  ),
  customInstructions: Schema.optional(Schema.String),
  outOfScopeTopics: Schema.optionalWith(
    Schema.Array(OutOfScopeTopicSchema),
    { default: () => [...DEFAULT_OUT_OF_SCOPE_TOPICS] },
  ),
  adminEmails: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  branding: Schema.optionalWith(
    Schema.Struct({
      title: Schema.optionalWith(Schema.String, { default: () => 'RAG Support' }),
      description: Schema.optionalWith(Schema.String, {
        default: () =>
          'AI customer support agent, with grounded citations.',
      }),
    }),
    {
      default: () => ({
        title: 'RAG Support',
        description: 'AI customer support agent, with grounded citations.',
      }),
    },
  ),
  seedDocsDir: Schema.optionalWith(Schema.String, {
    default: () => './documents',
  }),
  prefetchFirstTurn: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
});

// Mutable view of the config so callers (e.g. the CLI) can mutate
// fields before re-validating. Effect Schema's decoded type is
// readonly; we cast on the way out.
export type AppConfig = {
  orgName: string;
  orgShortName: string;
  audience: string;
  agentPersona: {
    name?: string;
    tone: 'friendly' | 'formal' | 'casual' | 'concise';
  };
  customInstructions?: string;
  outOfScopeTopics: Array<{ topic: string; handling: string }>;
  adminEmails: string[];
  branding: {
    title: string;
    description: string;
  };
  seedDocsDir: string;
  prefetchFirstTurn: boolean;
};

type Issue = { path: (string | number)[]; message: string };

type ParseSuccess = { success: true; data: AppConfig };
type ParseFailure = { success: false; error: { issues: Issue[] } };
type ParseResult = ParseSuccess | ParseFailure;

function toIssues(error: unknown): Issue[] {
  const message = error instanceof Error ? error.message : String(error);
  return [{ path: [], message }];
}

const decode = Schema.decodeUnknownEither(AppConfigSchema);

/** Zod-compatible parse: throws on failure (returns decoded value). */
export function parse(input: unknown): AppConfig {
  return Schema.decodeUnknownSync(AppConfigSchema)(input) as AppConfig;
}

/** Zod-compatible safe parse: never throws. */
export function safeParse(input: unknown): ParseResult {
  const result = decode(input);
  return Either.isRight(result)
    ? { success: true, data: result.right as AppConfig }
    : { success: false, error: { issues: toIssues(result.left) } };
}

// Expose a zod-like surface so existing call sites
// (`appConfigSchema.parse` / `.safeParse`) keep working.
export const appConfigSchema = {
  parse,
  safeParse,
} as const;
