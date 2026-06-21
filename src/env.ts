// Zod-validated env loader. Imported by route handlers and
// server actions so the first reference to process.env is
// through a typed schema; nothing in the app should touch
// process.env directly except infrastructure adapters that
// need to read DATABASE_URL / API keys at request time.
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  AI_STUDIO_KEY: z.string().optional(),
  CUSTOM_LLM_API_KEY: z.string().optional(),
  CUSTOM_LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  NEON_API_KEY: z.string().optional(),
  NEON_PROJECT_ID: z.string().optional(),
  NEON_TEST_BRANCH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid env: ${parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join(', ')}`,
  );
}

export const env: Env = parsed.data;
