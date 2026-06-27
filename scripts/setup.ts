// Thin shim — invokes `rag-agent setup` via tsx when run as the
// program root. The CLI sub-command implements the full interactive
// first-run wizard (env collection, validation, migration, seed).

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI = resolve(REPO_ROOT, 'packages/cli/src/index.ts');

const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const result = spawnSync('pnpm', ['exec', 'tsx', CLI, 'setup'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 0);
}
