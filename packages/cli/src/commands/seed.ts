// `rag-agent seed [--dir=...]` — read every PDF in the given
// directory and run it through the ingest pipeline. Mirrors
// what the admin upload flow does at runtime, so the seeded
// data is indistinguishable from production uploads.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Layer, Runtime } from 'effect';
import { ingestFile } from '@app/application/rag/ingest';
import { DbServicesLayer, InfraServicesLayer, Db, Storage } from '@app/infrastructure';

export interface SeedParseResult {
  dir: string;
  userId?: string;
}

export function parseSeedArgs(argv: string[]): SeedParseResult {
  let dir: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--dir=')) {
      dir = a.slice('--dir='.length);
    } else if (a === '--dir') {
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
  ingest?: (input: { fileName: string; buffer: Buffer; uploadedBy: string }) => Promise<{
    documentId: number;
    chunks: number;
    status: 'inserted' | 'updated' | 'unchanged';
  }>;
  storeBlob?: (documentId: number, buffer: Buffer, fileName: string) => Promise<void>;
}

function safeSeedName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

export async function runSeed(opts: SeedOptions = {}): Promise<void> {
  const userId = opts.userId ?? 'seed-script';
  const fixturesDir = opts.fixturesDir ?? './documents';
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
  const appLayer = Layer.mergeAll(DbServicesLayer, InfraServicesLayer);
  const runtime = await Effect.runPromise(Layer.toRuntime(appLayer).pipe(Effect.scoped));
  const run = Runtime.runPromise(runtime);
  const ingest = opts.ingest ?? ((input: { fileName: string; buffer: Buffer; uploadedBy: string }) =>
    run(ingestFile(input)) as Promise<{ documentId: number; chunks: number; status: 'inserted' | 'updated' | 'unchanged' }>);
  const storeBlob = opts.storeBlob ?? (async (documentId: number, buffer: Buffer, fileName: string) => {
    const blobStorage = Storage.createBlobStorage();
    const key = `docs/${documentId}/${safeSeedName(fileName)}`;
    await blobStorage.put(key, buffer, 'application/pdf');
    await Effect.runPromise(Db.setDocumentStorageKey(documentId, key));
  });
  for (const name of files) {
    const buffer = readFileSync(join(fixturesDir, name));
    const result = await ingest({ fileName: name, buffer, uploadedBy: userId });
    await storeBlob(result.documentId, buffer, name);
    console.log(
      `${name}: status=${result.status} documentId=${result.documentId} chunks=${result.chunks}`,
    );
  }
}

// CLI entry — only run when this module is the program root.
import { isMainModule } from '../is-main-module';

if (isMainModule()) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // .env.local may not exist; rely on env vars from the caller.
  }
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
  const { dir, userId } = parseSeedArgs(process.argv.slice(2));
  const absoluteDir = resolve(REPO_ROOT, dir);
  console.log(`Seeding PDFs from ${absoluteDir}`);
  runSeed({ userId, fixturesDir: absoluteDir }).catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
}
