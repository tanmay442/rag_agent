// Generates the Pulsar Analytics customer-support PDF fixtures used
// by the RAG corpus. Run with: pnpm tsx scripts/make-pulsar-fixtures.ts
//
// Uses pdf-lib to produce spec-compliant PDFs that pass strict
// pdfjs validation (including the v5 parser bundled by tsx).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

async function writePage(fileName: string, lines: string[]) {
  const doc = PDFDocument.create();
  const pdf = await doc;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);

  let y = 750;
  for (const line of lines) {
    if (y < 50) break;
    page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
    y -= 20;
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  const out = join(FIXTURES, fileName);
  writeFileSync(out, bytes);
  console.log(`Wrote ${out}`);
}

async function main() {
  // 1. Getting started
  await writePage('01-getting-started.pdf', [
    'Pulsar Analytics - Getting Started Guide',
    'Version 3.1 - Updated May 2026',
    '',
    '1. Create your account',
    'Go to app.pulsaranalytics.io/signup and enter your work email,',
    'full name, and a strong password. Pulsar sends a verification',
    'email; click the link within 24 hours to activate the workspace.',
    '',
    '2. First dashboard',
    'After verification, the onboarding wizard asks you to connect',
    'your first data source (Postgres, Snowflake, BigQuery, or CSV)',
    'and pick a starter template. The default template renders a',
    'revenue-by-week chart and a churn cohort table.',
    '',
    '3. Invite teammates',
    'Open Workspace > Members and click Invite. Enter email',
    'addresses and assign a role: Viewer, Editor, or Admin. Invited',
    'users receive an email with a one-time join link valid for 7',
    'days. The free Starter plan allows up to 3 members.',
    '',
    '4. Single sign-on',
    'Business and Enterprise plans can enable SSO via Workspace >',
    'Security > SSO. Pulsar supports SAML 2.0 and OIDC. After',
    'enabling SSO, new members must sign in through your IdP; the',
    'email/password path is disabled for the workspace.',
    '',
    '5. Get help',
    'From the app, click the question-mark icon to chat with Astra,',
    "Pulsar's in-app support agent, or email support@pulsaranalytics.io.",
    'Enterprise customers have a dedicated account manager reachable',
    'through the in-app support widget.',
  ]);

  // 2. Admin guide
  await writePage('02-admin-guide.pdf', [
    'Pulsar Analytics - Workspace Admin Guide',
    'Effective from May 2026',
    '',
    '1. Workspace settings',
    'Workspace > Settings is where admins change the workspace',
    'name, logo, default timezone, and billing contact. Changes',
    'propagate to all members within a minute.',
    '',
    '2. Roles and permissions',
    'Pulsar has three roles: Viewer (read-only dashboards),',
    'Editor (create and edit dashboards, cannot manage members)',
    'and Admin (full workspace control, including billing). Custom',
    'roles with granular permissions are available on the Enterprise',
    'plan only.',
    '',
    '3. Audit log',
    'Workspace > Audit log records every admin and editor action:',
    'member invites, role changes, dashboard publications, data',
    'source additions, and query exports. Entries are retained for',
    '90 days on Starter/Team and 365 days on Business/Enterprise.',
    '',
    '4. Data sources',
    'Workspace > Data sources lets admins connect, test, and remove',
    'data warehouse connections. Pulsar stores credentials encrypted',
    'at rest with envelope encryption; admins can rotate the workspace',
    'master key from the same page.',
    '',
    '5. Account recovery',
    'Admins can transfer workspace ownership to another member from',
    'Workspace > Settings > Ownership. The new owner must accept the',
    'transfer within 7 days, after which the original owner loses admin',
    'privileges.',
  ]);

  // 3. API reference
  await writePage('03-api-reference.pdf', [
    'Pulsar Analytics - REST API Reference',
    'Version 2026-05',
    '',
    '1. Authentication',
    'All requests authenticate with a bearer token issued from',
    'Workspace > Settings > API tokens. Tokens are scoped to a',
    "single workspace and inherit the issuing user's role. Pass the",
    'token in the Authorization header: Authorization: Bearer <token>.',
    '',
    '2. Rate limits',
    'The default rate limit is 60 requests per minute per token',
    'across the REST API and 600 requests per minute per workspace',
    'across all tokens. The /v1/query endpoint is capped at 10',
    'requests per minute per token. Rate-limited responses return',
    'HTTP 429 with a Retry-After header in seconds.',
    '',
    '3. Endpoints',
    'GET /v1/dashboards - list dashboards in the workspace.',
    'POST /v1/dashboards - create a new dashboard from a JSON spec.',
    'GET /v1/dashboards/{id} - retrieve a dashboard by id.',
    'PATCH /v1/dashboards/{id} - update title, layout, or filters.',
    "POST /v1/query - run an ad-hoc SQL query against the workspace's",
    'data sources; returns up to 10 000 rows.',
    '',
    '4. Webhooks',
    'Pulsar emits webhooks for the following events: dashboard',
    'published, dashboard shared, query failed, data source health',
    'degraded, and member invited. Configure webhook URLs in',
    'Workspace > Settings > Webhooks. Pulsar signs each delivery',
    'with HMAC-SHA256; verify the X-Pulsar-Signature header.',
    '',
    '5. SDKs',
    'Official SDKs are available for TypeScript, Python, and Go.',
    'All three expose the same surface: dashboards.list, dashboards',
    '.create, query.run. The SDKs retry idempotent requests up to',
    'three times with exponential backoff on 5xx responses.',
  ]);

  // 4. Billing and plans
  await writePage('04-billing-and-plans.pdf', [
    'Pulsar Analytics - Billing and Plans',
    'Updated May 2026',
    '',
    '1. Plan tiers',
    'Pulsar offers four plan tiers:',
    '  Starter: free, up to 3 members, 1 GB data, 30-day history.',
    '  Team: USD 49 per member per month, unlimited dashboards, 1-year',
    'history, email support.',
    '  Business: USD 99 per member per month, SSO, audit log 365 days,',
    'SLA 99.9 percent, priority support.',
    '  Enterprise: custom pricing, custom roles, dedicated infra,',
    'SLA 99.99 percent, dedicated CSM.',
    '',
    '2. Invoices',
    'Invoices are issued on the first of each month for the previous',
    'month. Download them from Workspace > Billing > Invoices.',
    'Each invoice lists every line item, the unit price, and the',
    'applicable tax for your billing address.',
    '',
    '3. Payment methods',
    'Pulsar accepts Visa, Mastercard, American Express, and ACH',
    'direct debit. Enterprise customers can pay by wire transfer with',
    'net-30 terms. Add a payment method from Workspace > Billing >',
    'Payment method.',
    '',
    '4. Failed payments and dunning',
    'If a charge fails, Pulsar retries the card on day 3 and day 7,',
    'sending an email to the billing contact each time. On day 14',
    'the workspace is downgraded to read-only; on day 30 the workspace',
    'is suspended. Update the card to restore access immediately.',
    '',
    '5. Cancellation',
    'Cancel anytime from Workspace > Billing > Plan. The workspace',
    'remains active until the end of the current billing period. After',
    'cancellation, data is retained for 30 days and then permanently',
    'deleted. Download an export before cancelling if you need it.',
    '',
    '6. Plan changes',
    'Upgrades take effect immediately and are pro-rated. Downgrades',
    'take effect at the next billing date; the workspace keeps its',
    'current features until then.',
  ]);

  // 5. Account and security
  await writePage('05-account-and-security.pdf', [
    'Pulsar Analytics - Account and Security',
    'Member-facing - Effective May 2026',
    '',
    '1. Change your password',
    'Open Settings > Security > Password. Enter your current password',
    'and then a new password of at least 12 characters. Pulsar',
    'enforces one uppercase, one lowercase, one digit, and one symbol.',
    'After saving, all other sessions are signed out automatically.',
    '',
    '2. Two-factor authentication',
    'Settings > Security > Two-factor authentication. Pulsar supports',
    'TOTP authenticator apps (Google Authenticator, 1Password, Authy)',
    'and hardware keys (FIDO2 / WebAuthn). Once enabled, sign-in',
    'requires both your password and a 6-digit code from your device.',
    '',
    '3. Session management',
    'Settings > Security > Active sessions lists every device and',
    'browser where you are signed in, with the IP, location, and last',
    'active time. Click Sign out to end any individual session, or',
    'Sign out everywhere to end all sessions except this one.',
    '',
    '4. API tokens',
    'Settings > Security > API tokens. Create a token with a name and',
    'scope (read-only, read-write, or admin). Pulsar shows the token',
    'value once at creation; copy and store it securely. Revoke a',
    'token at any time from the same page.',
    '',
    '5. Lost 2FA device',
    'If you lose the device that holds your 2FA codes, you can use a',
    'saved recovery code to sign in. Each member gets ten recovery',
    'codes at 2FA setup; each code works once. If you have used all',
    'of your recovery codes, contact support and a security engineer',
    'will verify your identity and reset 2FA on the workspace within',
    '1 business hour. The bot will open a security ticket for you',
    'automatically.',
    '',
    '6. IP allow-list',
    'Business and Enterprise admins can restrict workspace access',
    'to a list of IP ranges from Settings > Security > IP allow-list.',
    'Changes take effect within 5 minutes; members outside the list',
    'see a 403 error on sign-in.',
  ]);

  // 6. Troubleshooting
  await writePage('06-troubleshooting.pdf', [
    'Pulsar Analytics - Troubleshooting Guide',
    'Version 1.8 - May 2026',
    '',
    '1. Common errors',
    'Dashboard shows "stale": the underlying data source has not',
    'refreshed. Open the dashboard, click the data-source name in the',
    'footer, and choose Refresh now. See the data-and-integrations',
    'guide for refresh cadence defaults.',
    '',
    'Query failed with 429: the workspace is rate-limited. Wait for',
    'the time indicated in the Retry-After header (usually 30 to 60',
    'seconds) and retry. If you repeatedly hit 429, contact support to',
    'raise your workspace quota.',
    '',
    'Sign-in loop: your session cookie is stale. Sign out from the',
    'account menu, then sign back in. If the loop persists, clear the',
    'browser cookies for app.pulsaranalytics.io and try again.',
    '',
    '2. Status page',
    'Live system status is at status.pulsaranalytics.io. Pulsar posts',
    'incidents, planned maintenance, and historical uptime there.',
    'Subscribe with email or Slack to receive notifications.',
    '',
    '3. Diagnostic info',
    'When you contact support, please include your workspace id',
    'found in Settings > General, your account email, the time of the',
    'issue (with timezone), and a screenshot of the error toast.',
    '',
    '4. Support contact',
    'Starter: community forum only.',
    'Team: email support, 1 business day response.',
    'Business: priority email, 4 business hour response.',
    'Enterprise: dedicated CSM, 1 business hour response, 24x7',
    'for severity 1 incidents.',
    '',
    '5. Reporting a security issue',
    'Email security@pulsaranalytics.io or use the in-app Report a',
    "security issue link from the help menu. Pulsar's security team",
    'acknowledges within 1 business hour and aims to remediate',
    'within 24 hours for high-severity findings.',
  ]);

  // 7. Data and integrations
  await writePage('07-data-and-integrations.pdf', [
    'Pulsar Analytics - Data Sources and Integrations',
    'Effective May 2026',
    '',
    '1. Supported data sources',
    'Pulsar connects to managed Postgres (Neon, Supabase, RDS),',
    'Snowflake, BigQuery, Databricks, Redshift, and uploaded CSV.',
    'Each connection is configured in Workspace > Data sources and',
    'can be tested from the same page.',
    '',
    '2. Refresh cadence',
    'Each data source has a refresh schedule. The default is every 1)',
    'hour for warehouse sources and every 15 minutes for Postgres',
    "replicas. Change the cadence from the data source's edit page.",
    'Schedules as fast as every 5 minutes are available on Business',
    'and Enterprise plans.',
    '',
    '3. Schema drift',
    'When a connected table adds, removes, or renames a column,',
    'Pulsar flags the dashboard with a yellow warning banner. Click the',
    'banner to view a diff and either accept the change (which updates',
    "the dashboard's query automatically) or pin the dashboard to",
    'the previous schema until you fix it manually.',
    '',
    '4. Stale data',
    'If a dashboard is showing older values than expected, the cause',
    'is almost always one of: (a) the warehouse has not received new',
    'rows since the last refresh; (b) the refresh schedule is set to',
    'daily instead of hourly; (c) the source credential has expired and',
    'the connection is in a failed state. Open Workspace > Data',
    'sources to inspect status and last-run timestamps.',
    '',
    '5. Webhooks and outbound events',
    'See the API reference for the full list of webhooks Pulsar',
    'emits. The most common for downstream automation are:',
    'dashboard.published, query.failed, datasource.health.degraded.',
    'All three are signed with HMAC-SHA256.',
    '',
    '6. Limits',
    'Per query: 10 000 rows returned, 60 second timeout, 1 GB scanned.',
    'Per dashboard: 50 tiles. Per workspace: 500 dashboards on Team,',
    'unlimited on Business and Enterprise.',
  ]);

  console.log('All Pulsar Analytics fixtures generated.');
}

main().catch((err) => {
  console.error('Failed to generate fixtures:', err);
  process.exit(1);
});
