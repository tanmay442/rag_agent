// Local seeding script. Reads every PDF in scripts/fixtures/ and ingests
// it through the same path admin uploads use, so the seeded data is
// indistinguishable from production uploads.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { ingestFile } from '../src/lib/rag/ingest';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

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

// CLI entry — only run when this module is the program root.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  runSeed({ userId: process.argv[2] }).catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
}
