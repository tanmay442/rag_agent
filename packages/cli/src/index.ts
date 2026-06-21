// Thin CLI dispatcher. Sub-commands live in
// packages/cli/src/commands/<name>.ts. Run from the repo root
// with: \`tsx packages/cli/src/index.ts <sub-command> [...args]\`.
//
// When tsx is run against this file directly, process.argv
// looks like: ['node', 'index.ts', 'init', ...]. We strip the
// first two to get the sub-command and its args.
import { runInit } from './commands/init.js';
import { runFixtures } from './commands/fixtures.js';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function usage(): void {
  console.log(`Usage: rag-agent <command> [args]

Commands:
  init               Interactive first-time setup. Same as \`pnpm setup\`.
  seed [--dir=...]   Ingest every PDF in the given dir.
  fixtures [outDir]  Regenerate the Pulsar + school PDF fixtures.
  db-migrate [args]  Run drizzle-kit push (or other migration command).
`);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }
  switch (cmd) {
    case 'init':
      await runInit({ repoRoot: REPO_ROOT });
      return;
    case 'fixtures': {
      const outDir = rest[0] ?? './scripts/fixtures';
      const { written } = await runFixtures({ outDir, repoRoot: REPO_ROOT });
      console.log(`Wrote ${written.length} fixtures to ${outDir}`);
      return;
    }
    case 'seed': {
      // Delegate to scripts/seed-docs.ts via tsx. The script
      // already supports --dir=...
      const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-docs.ts', ...rest], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      process.exit(result.status ?? 0);
    }
    case 'db-migrate': {
      // Prompts for confirmation before destructive ops.
      if (rest.includes('--force')) {
        const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push', ...rest], {
          cwd: REPO_ROOT,
          stdio: 'inherit',
        });
        process.exit(result.status ?? 0);
      }
      console.log('About to run \`drizzle-kit push\` against the database in DATABASE_URL.');
      console.log('Re-run with --force to skip this confirmation.');
      const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force', ...rest], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      process.exit(result.status ?? 0);
    }
    default:
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('rag-agent failed:', err);
  process.exit(1);
});
