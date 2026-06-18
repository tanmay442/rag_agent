import { spawnSync } from 'node:child_process';

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
