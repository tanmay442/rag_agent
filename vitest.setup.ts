import '@testing-library/jest-dom/vitest';
import { loadEnv } from 'vite';

// Load .env.test so integration tests that need DATABASE_URL/AI_STUDIO_KEY
// etc. get them automatically. Variables are only loaded into process.env
// if they are not already set, so CI-provided values win.
const env = loadEnv('test', process.cwd(), '');
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
