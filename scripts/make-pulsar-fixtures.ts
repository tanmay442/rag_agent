// Thin shim — invokes \`rag-agent fixtures\` via tsx. The real
// implementation lives in packages/cli/src/commands/fixtures.ts.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI = resolve(REPO_ROOT, 'packages/cli/src/index.ts');

const outDir = process.argv[2] ?? './scripts/fixtures';
const result = spawnSync('pnpm', ['exec', 'tsx', CLI, 'fixtures', outDir], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});
process.exit(result.status ?? 0);
