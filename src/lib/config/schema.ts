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
  orgName: z.string().min(1).default('Gardenia Public School'),
  orgShortName: z.string().min(1).default('RAG Support'),
  audience: z.string().min(1).default('parents and students'),
  agentPersona: z
    .object({
      name: z.string().min(1).optional(),
      tone: toneSchema.default('friendly'),
    })
    .default({ tone: 'friendly' }),
  customInstructions: z.string().optional(),
  outOfScopeTopics: z
    .array(outOfScopeTopicSchema)
    .default([
      {
        topic: 'medical',
        handling:
          'Decline politely and suggest they contact the school nurse or their family doctor directly.',
      },
      {
        topic: 'legal',
        handling:
          'Decline politely and suggest they contact the appropriate office (front desk, principal) directly.',
      },
    ]),
  adminEmails: z.array(z.string().email()).default([]),
  branding: z
    .object({
      title: z.string().min(1).default('RAG Support'),
      description: z
        .string()
        .min(1)
        .default('Serverless AI customer support agent with RAG citations.'),
    })
    .default({
      title: 'RAG Support',
      description: 'Serverless AI customer support agent with RAG citations.',
    }),
  seedDocsDir: z.string().min(1).default('./documents'),
  prefetchFirstTurn: z.boolean().default(true),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export const DEFAULT_APP_CONFIG: AppConfig = appConfigSchema.parse({});
