// \`rag-agent fixtures\` — regenerates the seven Pulsar Analytics
// PDFs and the school student-handbook into the supplied output
// directory (default: ./scripts/fixtures). Pure file writes; no
// network or DB access.
import { join, isAbsolute, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  gettingStarted,
  adminGuide,
  apiReference,
  billingAndPlans,
  accountAndSecurity,
  troubleshooting,
  dataAndIntegrations,
  studentHandbook,
} from '@app/pulsar-content';

const PULSAR_FIXTURES = [
  gettingStarted,
  adminGuide,
  apiReference,
  billingAndPlans,
  accountAndSecurity,
  troubleshooting,
  dataAndIntegrations,
];

export interface FixturesOptions {
  outDir: string;
  includeSchool?: boolean;
  repoRoot: string;
}

export async function runFixtures(opts: FixturesOptions): Promise<{
  written: string[];
}> {
  const absOut = isAbsolute(opts.outDir) ? opts.outDir : resolve(opts.repoRoot, opts.outDir);
  mkdirSync(absOut, { recursive: true });
  const written: string[] = [];
  for (const mod of PULSAR_FIXTURES) {
    const out = await mod.write(absOut);
    written.push(out);
  }
  if (opts.includeSchool !== false) {
    const out = join(absOut, 'sample.pdf');
    studentHandbook.writeStudentHandbook(out);
    written.push(out);
  }
  return { written };
}

import { isMainModule } from '../is-main-module';

if (isMainModule()) {
  const outDir = process.argv[2] || './scripts/fixtures';
  runFixtures({ outDir, repoRoot: process.cwd() })
    .then(({ written }) => {
      console.log(`Wrote ${written.length} fixtures to ${outDir}`);
    })
    .catch((err) => {
      console.error('fixtures failed:', err);
      process.exit(1);
    });
}
