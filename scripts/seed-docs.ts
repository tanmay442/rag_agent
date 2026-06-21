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

// Dynamic import to avoid tsx/esbuild eagerly bundling pdf-parse's
// internal pdfjs-dist, which breaks PDF parsing in the tsx runtime.
// When imported statically, esbuild resolves a stricter pdfjs version
// that rejects valid PDFs with "bad XRef entry".
let ingestFile: typeof import('../src/lib/rag/ingest').ingestFile | undefined;

async function getIngestFile() {
  if (!ingestFile) {
    const mod = await import('../src/lib/rag/ingest');
    ingestFile = mod.ingestFile;
  }
  return ingestFile;
}

// Load .env.local so DATABASE_URL and AI_STUDIO_KEY are available
// when running via `pnpm seed` (CLI entry point below).
try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local may not exist; rely on env vars from the caller.
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export function parseArgs(argv: string[]): { dir: string; userId?: string } {
  let dir: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--dir=')) {
      dir = a.slice('--dir='.length);
    } else if (a === '--dir') {
      // Space-separated form: consume the next arg as the value
      // when it looks like a path (not another flag). Falls back
      // to the default if the user wrote `--dir` with nothing after.
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        dir = next;
        i++;
      }
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
  const ingest = opts.ingest ?? (await getIngestFile());
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
