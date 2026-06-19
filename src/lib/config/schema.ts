import { z } from 'zod';

// Single source of truth for the app's runtime configuration.
// `config/app.config.ts` exports a value of this type; the loader in
// `./index.ts` re-parses it through this schema so a malformed config
// file fails loudly at server start instead of producing silently
// broken prompts.
export const toneSchema = z.enum(['friendly', 'formal', 'casual', 'concise']);
export type Tone = z.infer<typeof toneSchema>;

export const outOfScopeTopicSchema = z.object({
  topic: z.string().min(1),
  handling: z.string().min(1),
});
export type OutOfScopeTopic = z.infer<typeof outOfScopeTopicSchema>;

export const appConfigSchema = z.object({
  orgName: z.string().min(1).default('Pulsar Analytics'),
  orgShortName: z.string().min(1).default('Pulsar Support'),
  audience: z
    .string()
    .min(1)
    .default('Pulsar Analytics customers and prospects'),
  agentPersona: z
    .object({
      name: z.string().min(1).optional(),
      tone: toneSchema.default('friendly'),
    })
    .default({ name: 'Astra', tone: 'friendly' }),
  customInstructions: z.string().optional(),
  outOfScopeTopics: z
    .array(outOfScopeTopicSchema)
    .default([
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
          'Decline politely. This assistant is for Pulsar product support only.',
      },
    ]),
  adminEmails: z.array(z.string().email()).default([]),
  branding: z
    .object({
      title: z.string().min(1).default('Pulsar Support'),
      description: z
        .string()
        .min(1)
        .default(
          'AI customer support agent for Pulsar Analytics, with grounded citations.',
        ),
    })
    .default({
      title: 'Pulsar Support',
      description:
        'AI customer support agent for Pulsar Analytics, with grounded citations.',
    }),
  seedDocsDir: z.string().min(1).default('./documents'),
  prefetchFirstTurn: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const DEFAULT_APP_CONFIG: AppConfig = appConfigSchema.parse({});
