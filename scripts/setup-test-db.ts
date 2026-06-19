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
  const api = (path: string) =>
    `https://console.neon.tech/api/v2/projects/${PROJECT_ID}${path}`;

  const list = await fetch(api(`/branches?search=${TEST_BRANCH}`), { headers });
  if (!list.ok) {
    throw new Error(`Failed to list branches: ${list.status} ${await list.text()}`);
  }
  const branchList = (await list.json()) as {
    branches: Array<{ id: string; name: string; primary: boolean }>;
  };
  let branch: { id: string; name: string } | undefined =
    branchList.branches.find((b) => b.name === TEST_BRANCH);

  if (!branch) {
    // Create the branch off the project's primary branch.
    const primary = branchList.branches.find((b) => b.primary);
    const create = await fetch(api('/branches'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: TEST_BRANCH,
        ...(primary ? { parent_id: primary.id } : {}),
      }),
    });
    if (!create.ok) {
      throw new Error(`Failed to create branch: ${create.status} ${await create.text()}`);
    }
    const created = (await create.json()) as { branch: { id: string; name: string } };
    branch = created.branch;
    console.log(`[setup-test-db] Created branch ${branch.name} (${branch.id})`);
  } else {
    console.log(`[setup-test-db] Reusing existing branch ${branch.name} (${branch.id})`);
  }

  if (!branch) {
    // Unreachable: the if/else above always assigns it.
    throw new Error('Internal error: branch was not assigned.');
  }

  // 2. Ensure the branch has a read-write endpoint. As of the
  //    current Neon API, creating a branch does not auto-create
  //    an endpoint; we have to POST one explicitly. If one
  //    already exists we reuse it.
  const endpointsRes = await fetch(api(`/branches/${branch.id}/endpoints`), { headers });
  if (!endpointsRes.ok) {
    throw new Error(
      `Failed to list endpoints: ${endpointsRes.status} ${await endpointsRes.text()}`,
    );
  }
  const { endpoints } = (await endpointsRes.json()) as {
    endpoints: Array<{ id: string; type: string; current_state: string }>;
  };
  let endpoint =
    endpoints.find((e) => e.type === 'read_write') ?? endpoints[0];
  if (!endpoint) {
    const createEp = await fetch(api('/endpoints'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: { branch_id: branch.id, type: 'read_write' },
      }),
    });
    if (!createEp.ok) {
      throw new Error(
        `Failed to create endpoint: ${createEp.status} ${await createEp.text()}`,
      );
    }
    const created = (await createEp.json()) as {
      endpoint: { id: string; type: string; current_state: string };
    };
    endpoint = created.endpoint;
    console.log(
      `[setup-test-db] Created read_write endpoint ${endpoint.id} (state=${endpoint.current_state})`,
    );
  }

  // 3. Wait for the endpoint to be ready (poll current_state).
  //    Neon returns "init" -> "active" over a few seconds; we
  //    bail after ~60s so a stuck branch doesn't hang CI.
  const deadline = Date.now() + 60_000;
  while (endpoint.current_state !== 'active' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(api(`/endpoints/${endpoint.id}`), { headers });
    if (!poll.ok) {
      throw new Error(
        `Failed to poll endpoint: ${poll.status} ${await poll.text()}`,
      );
    }
    const polled = (await poll.json()) as { endpoint: { current_state: string } };
    endpoint = { ...endpoint, current_state: polled.endpoint.current_state };
  }
  if (endpoint.current_state !== 'active') {
    throw new Error(
      `Endpoint ${endpoint.id} did not become active in time (state=${endpoint.current_state}).`,
    );
  }

  // 4. Get the connection URI for this branch.
  //    Neon's current API uses /connection_uri (not /connection_string)
  //    with `role_name` + `database_name` query params, returning
  //    { uri: "..." }. We pin to our branch via `branch_id`; the
  //    `endpoint_id` filter is restricted to the project's primary
  //    endpoint and rejects branch-only endpoints with 404.
  const conn = await fetch(
    api(
      `/connection_uri?role_name=neondb_owner&database_name=neondb&branch_id=${branch.id}`,
    ),
    { headers },
  );
  if (!conn.ok) {
    throw new Error(`Failed to fetch connection URI: ${conn.status} ${await conn.text()}`);
  }
  const { uri: connectionString } = (await conn.json()) as { uri: string };


  // 5. Write DATABASE_URL into .env.test.
  const envPath = resolve(process.cwd(), '.env.test');
  let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (/^DATABASE_URL=.*$/m.test(envText)) {
    envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${connectionString}"`);
  } else {
    envText += `\nDATABASE_URL="${connectionString}"\n`;
  }
  writeFileSync(envPath, envText, 'utf8');
  console.log(`[setup-test-db] Wrote DATABASE_URL to ${envPath}`);

  // 6. Apply migrations against the *test* branch URI. The
  //    parent process loaded .env via dotenv/config which
  //    points DATABASE_URL at the production branch, so we
  //    must override it for the child process. The same
  //    override is applied to `pnpm seed` below.
  try {
    execFileSync('pnpm', ['db:push', '--force'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: connectionString },
    });
  } catch (err) {
    console.error('[setup-test-db] pnpm db:push failed', err);
    process.exit(1);
  }

  // 7. Run the seed script against the test branch.
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
