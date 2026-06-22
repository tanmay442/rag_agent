// `rag-agent init` (and `pnpm setup`) — interactive first-time
// configuration. Walks the user through org details, agent
// persona, custom instructions, admin emails, and a folder of
// seed PDFs. Writes config/app.config.ts, upserts ADMIN_EMAILS in
// .env.local, copies PDFs (PDF-only) into the configured seed
// dir, and invokes the seed command.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import 'dotenv/config';
import {
  makeRl,
  ask,
  pickFromList,
  askYesNo,
  askMultiLine,
  type PromptOption,
} from '../prompts/index';

export interface PdfCopyOutcome {
  copied: string[];
  skipped: Array<{ file: string; reason: string }>;
}

export function copyPdfsFromDir(sourceDir: string, destDir: string): PdfCopyOutcome {
  const outcome: PdfCopyOutcome = { copied: [], skipped: [] };
  if (!existsSync(sourceDir)) {
    outcome.skipped.push({ file: sourceDir, reason: 'folder does not exist' });
    return outcome;
  }
  const stat = statSync(sourceDir);
  if (!stat.isDirectory()) {
    outcome.skipped.push({ file: sourceDir, reason: 'not a directory' });
    return outcome;
  }
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(sourceDir);
  for (const name of entries) {
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    if (ext !== '.pdf') {
      outcome.skipped.push({
        file: name,
        reason: 'only .pdf is accepted — non-PDFs are ignored by the RAG pipeline',
      });
      continue;
    }
    const src = join(sourceDir, name);
    if (!statSync(src).isFile()) {
      outcome.skipped.push({ file: name, reason: 'not a regular file' });
      continue;
    }
    copyFileSync(src, join(destDir, name));
    outcome.copied.push(name);
  }
  return outcome;
}

export function upsertAdminEmails(envPath: string, emails: string[]): void {
  if (emails.length === 0) return;
  const csv = emails.join(',');
  let body = '';
  if (existsSync(envPath)) {
    body = readFileSync(envPath, 'utf8');
  }
  const lines = body.split(/\r?\n/);
  let found = false;
  const next: string[] = [];
  for (const line of lines) {
    if (/^ADMIN_EMAILS\s*=/.test(line)) {
      next.push(`ADMIN_EMAILS=${csv}`);
      found = true;
    } else {
      next.push(line);
    }
  }
  if (!found) {
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push(`ADMIN_EMAILS=${csv}`);
  }
  writeFileSync(envPath, next.join('\n'));
}

// The config schema lives in src/lib/config/schema.ts today
// (commit 4 will move it to @app/domain). Import the JSON shape
// and reuse it here so the CLI keeps working.
import { appConfigSchema, type AppConfig } from '@app/domain';

const TONE_OPTIONS: ReadonlyArray<PromptOption<AppConfig['agentPersona']['tone']>> = [
  { value: 'friendly', label: 'Friendly', blurb: 'warm, conversational, a few sentences' },
  { value: 'formal', label: 'Formal', blurb: 'measured, professional, no contractions' },
  { value: 'casual', label: 'Casual', blurb: 'relaxed, plain language, short replies' },
  { value: 'concise', label: 'Concise', blurb: 'direct, minimal, one or two sentences' },
];

async function loadCurrentDefaults(repoRoot: string, configPath: string): Promise<AppConfig> {
  if (existsSync(configPath)) {
    try {
      const { default: existing } = (await import(
        configPath as unknown as string
      )) as { default: AppConfig };
      return appConfigSchema.parse(existing);
    } catch {
      // Fall through to defaults.
    }
  }
  void repoRoot;
  return appConfigSchema.parse({});
}

export interface InitOptions {
  repoRoot: string;
}

export interface InitResult {
  ok: boolean;
  configPath: string;
  envPath: string;
  destDir: string;
  copied: string[];
  skipped: Array<{ file: string; reason: string }>;
  ranSeed: boolean;
  seedReason?: string;
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const REPO_ROOT = opts.repoRoot;
  const CONFIG_PATH = join(REPO_ROOT, 'config', 'app.config.ts');
  const ENV_PATH = join(REPO_ROOT, '.env.local');

  const rl = makeRl();
  const defaults = await loadCurrentDefaults(REPO_ROOT, CONFIG_PATH);
  let config: AppConfig = defaults;

  console.log('\n\x1b[1mPulsar Analytics — first-time support agent setup\x1b[0m');
  console.log('Press Enter to keep the current value shown in [brackets].\n');

  const banner = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
  const ok = (s: string) => console.log(`\x1b[32m  ✓\x1b[0m ${s}`);

  banner('Organisation');
  config.orgName = await ask(rl, 'Company / org name', config.orgName);
  config.orgShortName = await ask(rl, 'Short name (nav brand)', config.orgShortName);
  config.audience = await ask(
    rl,
    'Who does the agent talk to? (e.g. "Pulsar Analytics customers and prospects")',
    config.audience,
  );

  banner('Agent persona');
  const personaNameInput = await ask(
    rl,
    'Agent name (optional, blank for none)',
    config.agentPersona.name ?? '',
  );
  config.agentPersona = {
    name: personaNameInput === '' ? undefined : personaNameInput,
    tone: await pickFromList(rl, 'Tone:', TONE_OPTIONS, config.agentPersona.tone),
  };

  banner('Out-of-scope topics');
  console.log('Current list:');
  for (const t of config.outOfScopeTopics) {
    console.log(`  - ${t.topic}: ${t.handling}`);
  }
  if (await askYesNo(rl, 'Edit the out-of-scope list?', false)) {
    const next: AppConfig['outOfScopeTopics'] = [];
    let first = true;
    for (const existing of config.outOfScopeTopics) {
      const keep = await askYesNo(rl, `Keep "${existing.topic}"?`, first);
      first = false;
      if (keep) next.push(existing);
    }
    let addMore = await askYesNo(rl, 'Add a new out-of-scope topic?', false);
    while (addMore) {
      const topic = await ask(rl, '  topic (e.g. "fee negotiation")', '');
      if (!topic) break;
      const handling = await ask(rl, `  handling for "${topic}"`, '');
      if (!handling) break;
      next.push({ topic, handling });
      addMore = await askYesNo(rl, 'Add another?', false);
    }
    config.outOfScopeTopics = next;
  }

  banner('Custom instructions');
  console.log('Anything extra the agent should always do or never do?');
  const custom = await askMultiLine(
    rl,
    'Custom instructions (optional):',
    config.customInstructions ?? '',
  );
  config.customInstructions = custom === '' ? undefined : custom;

  banner('Admin emails');
  console.log('Comma-separated. The first time one of these emails signs in via Clerk,');
  console.log('they are auto-promoted to admin.');
  const adminInput = await ask(
    rl,
    'Admin emails (comma-separated, blank to skip)',
    config.adminEmails.join(', '),
  );
  const parsedEmails = adminInput
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  config.adminEmails = parsedEmails;

  banner('Branding');
  config.branding = {
    title: await ask(rl, 'Browser tab title', config.branding.title),
    description: await ask(rl, 'Meta description', config.branding.description),
  };

  banner('Seed PDFs');
  const sourceDir = await ask(
    rl,
    'Path to a folder of PDFs to use as the RAG corpus',
    config.seedDocsDir,
  );
  const absSource = isAbsolute(sourceDir) ? sourceDir : resolve(REPO_ROOT, sourceDir);
  console.log(`  resolved: ${absSource}`);

  const validated = appConfigSchema.safeParse(config);
  if (!validated.success) {
    console.error('\nInvalid configuration:');
    for (const i of validated.error.issues) {
      console.error(`  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    }
    rl.close();
    process.exit(1);
  }
  config = validated.data;

  const destDir = isAbsolute(config.seedDocsDir)
    ? config.seedDocsDir
    : resolve(REPO_ROOT, config.seedDocsDir);

  writeConfigFile(CONFIG_PATH, config);
  ok(`wrote ${relative(REPO_ROOT, CONFIG_PATH)}`);
  upsertAdminEmails(ENV_PATH, config.adminEmails);
  if (config.adminEmails.length > 0) {
    ok(`wrote ADMIN_EMAILS to ${relative(REPO_ROOT, ENV_PATH)}`);
  }

  const outcome = copyPdfsFromDir(absSource, destDir);
  if (outcome.copied.length > 0) {
    ok(`copied ${outcome.copied.length} PDF(s) to ${relative(REPO_ROOT, destDir)}/`);
  } else {
    console.log(`  (no PDFs copied from ${absSource})`);
  }
  for (const s of outcome.skipped) {
    console.log(`\x1b[33m  ⚠ skipped ${s.file}: ${s.reason}\x1b[0m`);
  }
  if (outcome.skipped.length > 0) {
    console.log(`  Hint: the RAG pipeline only accepts .pdf files. ${outcome.skipped.length} non-PDF(s) ignored.`);
  }

  const { ran, reason } = runSeedIfPossible(REPO_ROOT, destDir);
  if (ran) {
    ok('seeded PDFs into the database');
  } else {
    console.log(`\x1b[33m  ⚠ seed skipped: ${reason}\x1b[0m`);
  }

  rl.close();
  return {
    ok: true,
    configPath: CONFIG_PATH,
    envPath: ENV_PATH,
    destDir,
    copied: outcome.copied,
    skipped: outcome.skipped,
    ranSeed: ran,
    seedReason: reason,
  };
}

function writeConfigFile(configPath: string, config: AppConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, renderConfigFile(config));
}

function renderConfigFile(config: AppConfig): string {
  const body = JSON.stringify(config, null, 2).replace(/"([^"]+)":/g, '$1:');
  return `import type { AppConfig } from '@app/domain';

// Runtime configuration for this deployment of the RAG Support Agent.
// Edit any field, or run \`pnpm setup\` to be walked through the values
// interactively. The schema validates this object on load.

const config: AppConfig = ${body};

export default config;
`;
}

function runSeedIfPossible(repoRoot: string, destDir: string): { ran: boolean; reason?: string } {
  if (!process.env.DATABASE_URL) {
    return {
      ran: false,
      reason: 'DATABASE_URL is not set in .env.local; re-run `pnpm setup` (or just `pnpm seed`) once you have a Neon database.',
    };
  }
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/seed-docs.ts'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, SEED_DOCS_DIR: destDir },
    },
  );
  if (result.status !== 0) {
    return { ran: false, reason: `seed script exited with status ${result.status ?? 'unknown'}` };
  }
  return { ran: true };
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
  const repoRoot = process.cwd();
  runInit({ repoRoot }).catch((err) => {
    console.error('init failed:', err);
    process.exit(1);
  });
}
