// Thin shim — kept so existing invocations
//   `pnpm tsx scripts/make-pulsar-fixtures.ts`
// continue to work after the content moved into the
// @app/pulsar-content workspace package. The real source of
// truth is in packages/pulsar-content/src/pulsar/*.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gettingStarted,
  adminGuide,
  apiReference,
  billingAndPlans,
  accountAndSecurity,
  troubleshooting,
  dataAndIntegrations,
} from '../packages/pulsar-content/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

const all = [
  gettingStarted,
  adminGuide,
  apiReference,
  billingAndPlans,
  accountAndSecurity,
  troubleshooting,
  dataAndIntegrations,
];

async function main() {
  for (const mod of all) {
    const out = await mod.write(FIXTURES);
    console.log(`Wrote ${out}`);
  }
  console.log('All Pulsar Analytics fixtures generated.');
}

main().catch((err) => {
  console.error('Failed to generate fixtures:', err);
  process.exit(1);
});
