// Interactive first-time setup for a deployment of the Pulsar
// Analytics customer-support agent (or any deployment of the same
// RAG Support Agent code, simply re-skinned via the prompts below).
// Agent. Walks the user through org details, agent persona, custom
// instructions, admin emails, and a folder of seed PDFs. Writes
// config/app.config.ts, upserts ADMIN_EMAILS in .env.local, copies
// PDFs (PDF-only — non-PDFs are reported and skipped) into the
// configured seed dir, and re-runs `pnpm seed` to ingest them.
//
// Pure Node: readline + fs + child_process. Zero runtime deps.
//
// Idempotent: every prompt accepts Enter to keep the current value.

import { createInterface, type Interface } from 'node:readline';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import 'dotenv/config';

import { appConfigSchema, type AppConfig, type Tone } from '../src/lib/config/schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CONFIG_PATH = join(REPO_ROOT, 'config', 'app.config.ts');
const ENV_PATH = join(REPO_ROOT, '.env.local');

const TONE_OPTIONS: Array<{ value: Tone; label: string; blurb: string }> = [
  { value: 'friendly', label: 'Friendly', blurb: 'warm, conversational, a few sentences' },
  { value: 'formal',   label: 'Formal',   blurb: 'measured, professional, no contractions' },
  { value: 'casual',   label: 'Casual',   blurb: 'relaxed, plain language, short replies' },
  { value: 'concise',  label: 'Concise',  blurb: 'direct, minimal, one or two sentences' },
];

const REQUIRED_ENV_HINTS: Array<{ key: string; hint: string }> = [
  { key: 'DATABASE_URL',         hint: 'Neon Serverless Postgres connection string (https://neon.tech)' },
  { key: 'AI_STUDIO_KEY',        hint: 'Google AI Studio key for embeddings (https://aistudio.google.com/apikey)' },
  { key: 'CUSTOM_LLM_API_KEY',   hint: 'API key for your OpenAI-compatible chat endpoint' },
  { key: 'CUSTOM_LLM_BASE_URL',  hint: 'Base URL of your OpenAI-compatible chat endpoint' },
  { key: 'LLM_MODEL',            hint: 'Model id served by that endpoint (e.g. gpt-4o-mini)' },
  { key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', hint: 'Clerk publishable key (Vercel Marketplace: `vercel integration add clerk`)' },
  { key: 'CLERK_SECRET_KEY',     hint: 'Clerk secret key (auto-provisioned by the Vercel Marketplace integration)' },
];

// ---- CLI plumbing ---------------------------------------------------------

function makeRl(): Interface {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: Interface, question: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() === '' ? defaultValue : answer.trim());
    });
  });
}

function pickFromList<T extends { value: string; label: string; blurb?: string }>(
  rl: Interface,
  question: string,
  options: ReadonlyArray<T>,
  defaultValue: T['value'],
): Promise<T['value']> {
  return new Promise((resolve) => {
    console.log(question);
    for (let i = 0; i < options.length; i++) {
      const o = options[i]!;
      const marker = o.value === defaultValue ? '*' : ' ';
      const blurb = o.blurb ? ` — ${o.blurb}` : '';
      console.log(`  ${marker} ${i + 1}) ${o.label}${blurb}`);
    }
    rl.question(`Choose [1-${options.length}] (default: ${defaultValue}): `, (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(defaultValue);
        return;
      }
      const n = Number.parseInt(trimmed, 10);
      if (Number.isFinite(n) && n >= 1 && n <= options.length) {
        resolve(options[n - 1]!.value);
        return;
      }
      const match = options.find((o) => o.value === trimmed.toLowerCase());
      if (match) {
        resolve(match.value);
        return;
      }
      console.log(`  (unrecognised choice; keeping "${defaultValue}")`);
      resolve(defaultValue);
    });
  });
}

async function askYesNo(rl: Interface, question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`${question} (${hint}): `, (answer) => {
      const v = answer.trim().toLowerCase();
      if (v === '') resolve(defaultYes);
      else if (v === 'y' || v === 'yes') resolve(true);
      else if (v === 'n' || v === 'no') resolve(false);
      else {
        console.log(`  (unrecognised answer; using default: ${defaultYes ? 'yes' : 'no'})`);
        resolve(defaultYes);
      }
    });
  });
}

async function askMultiLine(rl: Interface, prompt: string, defaultValue: string): Promise<string> {
  console.log(prompt);
  console.log('  (Enter on an empty line to finish)');
  const lines: string[] = [];
  const first = await new Promise<string>((res) => rl.question('  > ', res));
  if (first === '' && defaultValue) {
    return defaultValue;
  }
  if (first !== '') lines.push(first);
  while (true) {
    const line: string = await new Promise((res) => rl.question('  > ', res));
    if (line === '') break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

// ---- Config loading / saving ---------------------------------------------

async function loadCurrentDefaults(): Promise<AppConfig> {
  // Try to import the existing config file so prompts default to
  // current values. If anything goes wrong (file missing, import
  // error, schema mismatch) we fall back to schema defaults so the
  // CLI still runs.
  if (!existsSync(CONFIG_PATH)) {
    return appConfigSchema.parse({});
  }
  try {
    const mod = (await import(pathToFileURL(CONFIG_PATH).href + '?t=' + Date.now())) as {
      default: unknown;
    };
    const parsed = appConfigSchema.safeParse(mod.default);
    if (parsed.success) return parsed.data;
    return appConfigSchema.parse({});
  } catch {
    return appConfigSchema.parse({});
  }
}

function renderConfigFile(config: AppConfig): string {
  return `import type { AppConfig } from '../src/lib/config/schema';

// Runtime configuration for this deployment of the RAG Support Agent.
//
// Edit any field, or run \`pnpm setup\` to be walked through the values
// interactively. The schema in \`src/lib/config/schema.ts\` validates
// this object on load; required fields have defaults so an empty
// file is valid.
//
// Required externally: nothing. This file is the source of truth for
// org name, agent persona, admin bootstrap emails, and the seed-PDFs
// directory. The setup CLI also writes \`ADMIN_EMAILS\` to .env.local
// so the existing Clerk-based admin bootstrap in src/lib/auth/users.ts
// keeps working.

const config: AppConfig = ${JSON.stringify(config, null, 2)
    .replace(/"([^"]+)":/g, '$1:')};

export default config;
`;
}

function writeConfigFile(config: AppConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, renderConfigFile(config));
}

// ---- PDF handling ---------------------------------------------------------

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

// ---- .env.local handling --------------------------------------------------

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

// ---- Seeding orchestration ------------------------------------------------

function runSeedIfPossible(destDir: string): { ran: boolean; reason?: string } {
  if (!process.env.DATABASE_URL) {
    return {
      ran: false,
      reason: 'DATABASE_URL is not set in .env.local; re-run `pnpm setup` (or just `pnpm seed`) once you have a Neon database.',
    };
  }
  console.log(`\nIngesting PDFs from ${destDir} ...`);
  const result = spawnSync('pnpm', ['seed'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, SEED_DOCS_DIR: destDir },
  });
  if (result.status !== 0) {
    return { ran: false, reason: `pnpm seed exited with code ${result.status}` };
  }
  return { ran: true };
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  const rl = makeRl();
  const defaults = await loadCurrentDefaults();
  let config: AppConfig = defaults;

  console.log('\n\x1b[1mPulsar Analytics — first-time support agent setup\x1b[0m');
  console.log('Press Enter to keep the current value shown in [brackets].\n');

  const banner = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
  const ok = (s: string) => console.log(`\x1b[32m  ✓\x1b[0m ${s}`);

  banner('Organisation');
  config.orgName = await ask(rl, 'Company / org name', config.orgName);
  config.orgShortName = await ask(rl, 'Short name (nav brand)', config.orgShortName);
  config.audience = await ask(rl, 'Who does the agent talk to? (e.g. "Pulsar Analytics customers and prospects")', config.audience);

  banner('Agent persona');
  const personaNameInput = await ask(rl, 'Agent name (optional, blank for none)', config.agentPersona.name ?? '');
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
  console.log('Examples: "Always sign off as — The Front Office"; "Never discuss staff by name".');
  const custom = await askMultiLine(rl, 'Custom instructions (optional):', config.customInstructions ?? '');
  config.customInstructions = custom === '' ? undefined : custom;

  banner('Admin emails');
  console.log('Comma-separated. The first time one of these emails signs in via Clerk,');
  console.log('they are auto-promoted to admin. After that, admins promote others from /admin/users.');
  const adminInput = await ask(
    rl,
    'Admin emails (comma-separated, blank to skip)',
    config.adminEmails.join(', '),
  );
  const parsedEmails = adminInput
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parsedEmails.length > 0) {
    const valid = parsedEmails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!valid) {
      console.log('  (one or more emails looked invalid; keeping as-is and continuing)');
    }
  }
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

  // Validate the new config before we write anything.
  const validated = appConfigSchema.safeParse(config);
  if (!validated.success) {
    console.error('\nInvalid configuration:');
    for (const i of validated.error.issues) {
      console.error(`  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    }
    process.exit(1);
  }
  config = validated.data;

  const destDir = isAbsolute(config.seedDocsDir)
    ? config.seedDocsDir
    : resolve(REPO_ROOT, config.seedDocsDir);

  writeConfigFile(config);
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

  console.log('\n\x1b[1mRemaining environment variables\x1b[0m');
  console.log('Add these to .env.local (or set them in the Vercel dashboard for production):');
  for (const { key, hint } of REQUIRED_ENV_HINTS) {
    const current = process.env[key];
    const status = current ? '\x1b[32mset\x1b[0m' : '\x1b[33mmissing\x1b[0m';
    console.log(`  - ${key} (${status}) — ${hint}`);
  }

  if (outcome.copied.length > 0) {
    const seed = runSeedIfPossible(config.seedDocsDir);
    if (!seed.ran && seed.reason) {
      console.log(`\n\x1b[33mSeed skipped:\x1b[0m ${seed.reason}`);
    } else if (seed.ran) {
      ok('seed complete');
    }
  }

  console.log('\n\x1b[1mDone.\x1b[0m Run `pnpm dev` to start the app.');
  rl.close();
}

// Only run when this module is the program root. Without this
// guard, importing the file (e.g. from a test) would block on
// readline and leak a prompt to stdout.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error('\nSetup failed:', err);
    process.exit(1);
  });
}
