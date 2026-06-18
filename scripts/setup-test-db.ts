// Provision a per-run Neon branch for tests, write the resulting
// DATABASE_URL into .env.test, then apply migrations + run the seed
// script. Skips cleanly when NEON_API_KEY is not set (local dev
// without network access — `.env.test` is then left as-is and the
// caller decides how to source a database).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';

export async function main() {
  const PROJECT_ID = process.env.NEON_PROJECT_ID;
  const API_KEY = process.env.NEON_API_KEY;
  const TEST_BRANCH = process.env.NEON_TEST_BRANCH ?? 'dev-test';
  if (!PROJECT_ID || !API_KEY) {
    console.warn(
      '[setup-test-db] NEON_PROJECT_ID and NEON_API_KEY are not set; skipping branch creation.',
    );
    return;
  }

  // 1. Find or create the test branch.
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const list = await fetch(
    `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches?search=${TEST_BRANCH}`,
    { headers },
  );
  if (!list.ok) {
    throw new Error(`Failed to list branches: ${list.status} ${await list.text()}`);
  }
  const branchList = (await list.json()) as { branches: Array<{ id: string; name: string }> };
  let branch = branchList.branches.find((b) => b.name === TEST_BRANCH);
  if (!branch) {
    const create = await fetch(
      `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: TEST_BRANCH, parent_id: undefined as unknown as string }),
      },
    );
    if (!create.ok) {
      throw new Error(`Failed to create branch: ${create.status} ${await create.text()}`);
    }
    const created = (await create.json()) as { branch: { id: string; name: string } };
    branch = created.branch;
    console.log(`[setup-test-db] Created branch ${branch.name} (${branch.id})`);
  } else {
    console.log(`[setup-test-db] Reusing existing branch ${branch.name} (${branch.id})`);
  }

  // 2. Get the connection string.
  const conn = await fetch(
    `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches/${branch.id}/connection_string?role=neondb_owner&database=neondb`,
    { headers },
  );
  if (!conn.ok) {
    throw new Error(`Failed to fetch connection string: ${conn.status} ${await conn.text()}`);
  }
  const { connection_string: connectionString } = (await conn.json()) as {
    connection_string: string;
  };

  // 3. Write DATABASE_URL into .env.test.
  const envPath = resolve(process.cwd(), '.env.test');
  let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (/^DATABASE_URL=.*$/m.test(envText)) {
    envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${connectionString}"`);
  } else {
    envText += `\nDATABASE_URL="${connectionString}"\n`;
  }
  writeFileSync(envPath, envText, 'utf8');
  console.log(`[setup-test-db] Wrote DATABASE_URL to ${envPath}`);

  // 4. Apply migrations.
  try {
    execFileSync('pnpm', ['db:push'], { stdio: 'inherit' });
  } catch (err) {
    console.error('[setup-test-db] pnpm db:push failed', err);
    process.exit(1);
  }

  // 5. Run the seed script against the test branch.
  const seed = spawnSync('pnpm', ['seed'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionString },
  });
  if (seed.status !== 0) {
    process.exit(seed.status ?? 1);
  }
  console.log('[setup-test-db] Done');
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
  main().catch((err) => {
  console.error('[setup-test-db] failed:', err);
    process.exit(1);
  });
}
