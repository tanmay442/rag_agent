// Thin shim — invokes \`rag-agent init\` via tsx when run as the
// program root. When imported (e.g. by tests), it re-exports the
// helpers from @app/cli/commands/init so existing test code
// keeps working.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyPdfsFromDir, upsertAdminEmails } from '../packages/cli/src/commands/init.js';

export { copyPdfsFromDir, upsertAdminEmails };

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
  const result = spawnSync('pnpm', ['exec', 'tsx', CLI, 'init'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 0);
}
