import 'server-only';
import rawConfig from '../../../config/app.config';
import { appConfigSchema, type AppConfig } from '@app/domain/app-config';

// Validate the imported config at module load. If a required field
// is missing, an env-var lookup is wrong, or a string is empty, we
// throw immediately so the server never boots with broken prompts
// or admin bootstrap. The schema's `.default(...)` calls fill in
// any field the user did not set.
const parsed = appConfigSchema.safeParse(rawConfig);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Invalid config/app.config.ts. Fix the following and re-run:\n${issues}`,
  );
}

export const appConfig: AppConfig = parsed.data;
export type { AppConfig };
