import { spawnSync } from 'node:child_process';

// TODO :) e2e suite is currently disabled in CI — see
// e2e/README.md and the commented-out block in
// .github/workflows/ci.yml for the full list of blockers.
// When re-enabling, this file already does the right thing:
// it provisions a per-run Neon branch (via scripts/setup-test-db.ts)
// and tears it down via the `trap` in package.json's test:ci script.
//
// Runs before any spec. In CI this should create the test branch and
// seed it; in local dev the user can opt out by setting SKIP_E2E_SETUP=1.
export default async function globalSetup() {
  if (process.env.SKIP_E2E_SETUP === '1') {
    console.log('[e2e global-setup] SKIP_E2E_SETUP=1; skipping branch provisioning');
    return;
  }
  console.log('[e2e global-setup] Provisioning test DB…');
  const result = spawnSync('pnpm', ['setup-test-db'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`setup-test-db failed with status ${result.status}`);
  }
}
