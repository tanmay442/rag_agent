// Delete the per-run Neon test branch. Idempotent — does nothing when
// the branch is missing. Skips cleanly when NEON_API_KEY is not set.
import 'dotenv/config';

export async function main() {
  const PROJECT_ID = process.env.NEON_PROJECT_ID;
  const API_KEY = process.env.NEON_API_KEY;
  const TEST_BRANCH = process.env.NEON_TEST_BRANCH ?? 'dev-test';
  if (!PROJECT_ID || !API_KEY) {
    console.warn(
      '[teardown-test-db] NEON_PROJECT_ID and NEON_API_KEY are not set; skipping.',
    );
    return;
  }
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
  const branch = branchList.branches.find((b) => b.name === TEST_BRANCH);
  if (!branch) {
    console.log(`[teardown-test-db] No ${TEST_BRANCH} branch — nothing to do.`);
    return;
  }
  const del = await fetch(
    `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches/${branch.id}`,
    { method: 'DELETE', headers },
  );
  if (!del.ok) {
    throw new Error(`Failed to delete branch: ${del.status} ${await del.text()}`);
  }
  console.log(`[teardown-test-db] Deleted branch ${branch.name} (${branch.id})`);
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
  console.error('[teardown-test-db] failed:', err);
    process.exit(1);
  });
}
