// Local seeding script. Reads every PDF in the chosen directory and
// ingests it through the same path admin uploads use, so the seeded
// data is indistinguishable from production uploads.
//
// Usage:
//   pnpm seed                # uses SEED_DOCS_DIR or ./documents
//   pnpm seed -- --dir=./x   # uses ./x
//   tsx scripts/seed-docs.ts --dir=./x [userId]
//
// The `pnpm setup` CLI copies user-supplied PDFs into `./documents`
// and then invokes this script via `pnpm seed`, so by default the
// two flows agree on the source folder.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { ingestFile } from '../src/lib/rag/ingest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

function parseArgs(argv: string[]): { dir: string; userId?: string } {
  let dir: string | undefined;
  const positional: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--dir=')) {
      dir = a.slice('--dir='.length);
    } else if (a === '--dir') {
      // next arg is the value; loop will pick it up if we shift
    } else if (!a.startsWith('--')) {
      positional.push(a);
    }
  }
  if (!dir && process.env.SEED_DOCS_DIR) dir = process.env.SEED_DOCS_DIR;
  if (!dir) dir = './documents';
  return { dir, userId: positional[0] };
}

export interface SeedOptions {
  userId?: string;
  fixturesDir?: string;
  ingest?: typeof ingestFile;
}

export async function runSeed(opts: SeedOptions = {}): Promise<void> {
  const userId = opts.userId ?? 'seed-script';
  const fixturesDir = opts.fixturesDir ?? FIXTURES;
  const ingest = opts.ingest ?? ingestFile;
  let files: string[];
  try {
    files = readdirSync(fixturesDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
  } catch {
    console.error(`Cannot read fixtures directory: ${fixturesDir}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`No PDFs found in ${fixturesDir}`);
    process.exit(1);
  }
  for (const name of files) {
    const buffer = readFileSync(join(fixturesDir, name));
    const result = await ingest({ fileName: name, buffer, uploadedBy: userId });
    console.log(
      `${name}: status=${result.status} documentId=${result.documentId} chunks=${result.chunks}`,
    );
  }
}

// Default fixtures dir kept for backwards compatibility / tests.
// `runSeed({ fixturesDir })` overrides it; the CLI entry below
// resolves its own dir from argv / env.
const FIXTURES = join(HERE, 'fixtures');

// CLI entry — only run when this module is the program root.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const { dir, userId } = parseArgs(process.argv.slice(2));
  const absoluteDir = resolve(REPO_ROOT, dir);
  console.log(`Seeding PDFs from ${absoluteDir}`);
  runSeed({ userId, fixturesDir: absoluteDir }).catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
}
