// Generates the Pulsar Analytics customer-support PDF fixtures used
// by the RAG corpus. Run with: pnpm tsx scripts/make-pulsar-fixtures.ts
//
// The PDFs are intentionally small and use a hand-rolled PDF writer
// so the repo doesn't depend on a third-party tool at install time.
// The writer produces RFC-compliant PDFs:
//   - The /Length value is the BYTE length of the stream (not the
//     JS string length) so multi-byte chars don't break pdfjs.
//   - The xref table uses CRLF (\r\n) end-of-line terminators, per
//     PDF 1.4 spec Table 17. Some strict pdfjs readers reject pure-LF
//     xref entries.
//   - The file ends with %%EOF followed by a newline.
// `pnpm seed` walks `scripts/fixtures/*.pdf` and ingests them
// through the production code path, so the seeded data is
// indistinguishable from admin uploads.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

// Compute the BYTE length of a string as it will appear in the PDF
// stream (which is raw 8-bit Latin-1 in our case). PDF string
// literals are wrapped in parens but only support single-byte
// characters; non-ASCII must be UTF-16BE in <feff...> hex strings.
// Since all our fixture content is pure ASCII, byte length === string
// length, but we still go through Buffer.byteLength to be safe.
function pdfBytes(s: string): Buffer {
  return Buffer.from(s, 'binary');
}

function buildPdf(content: string): string {
  // The /Length value MUST be the byte length of the stream's
  // content, which equals Buffer.byteLength(content, 'binary') for
  // our ASCII-only content.
  const streamBytes = pdfBytes(content);
  const length = streamBytes.length;

  // Build the five objects in order.
  const obj1 = '<< /Type /Catalog /Pages 2 0 R >>';
  const obj2 = '<< /Type /Pages /Count 1 /Kids [3 0 R] >>';
  const obj3 =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
    '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  // The stream object MUST be the raw bytes between `stream\n` and
  // `\nendstream`. We assemble it with a Buffer so the byte count
  // is exact.
  const obj4 = `<< /Length ${length} >>\nstream\n${content}\nendstream`;
  const obj5 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  // Assemble the file body. Each object is followed by `\r\n` so the
  // xref offsets are calculated against a stable byte stream.
  const body = `1 0 obj\r\n${obj1}\r\nendobj\r\n` +
    `2 0 obj\r\n${obj2}\r\nendobj\r\n` +
    `3 0 obj\r\n${obj3}\r\nendobj\r\n` +
    `4 0 obj\r\n${obj4}\r\nendobj\r\n` +
    `5 0 obj\r\n${obj5}\r\nendobj\r\n`;

  // Compute object byte offsets. pdf-parse/pdfjs requires the
  // xref table to point to the EXACT byte position of each
  // "N 0 obj" line. We compute them by walking the body string.
  const offsets: number[] = [];
  const objRegex = /(\d+) 0 obj\r\n/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(body)) !== null) {
    offsets[parseInt(m[1], 10) - 1] = m.index;
  }

  // Build the xref table. The PDF spec mandates exactly 20 bytes
  // per entry, with CRLF as the EOL (we use CRLF, not LF).
  const xrefHeader = `xref\r\n0 6\r\n`;
  const xrefEntries =
    '0000000000 65535 f \r\n' +
    offsets
      .map((off) => off.toString().padStart(10, '0') + ' 00000 n \r\n')
      .join('');
  const xrefTable = xrefHeader + xrefEntries;

  const xrefOffset = body.length;
  const trailer =
    `trailer\r\n<< /Size 6 /Root 1 0 R >>\r\n` +
    `startxref\r\n${xrefOffset}\r\n` +
    `%%EOF\r\n`;

  return body + xrefTable + trailer;
}

function writePage(fileName: string, content: string) {
  const out = join(FIXTURES, fileName);
  writeFileSync(out, buildPdf(content), 'utf8');
  console.log(`Wrote ${out}`);
}

// 1. Getting started
writePage('01-getting-started.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Getting Started Guide) Tj
0 -20 Td
(Version 3.1 - Updated May 2026) Tj
0 -40 Td
(1. Create your account) Tj
0 -20 Td
(Go to app.pulsaranalytics.io/signup and enter your work email,) Tj
0 -20 Td
(full name, and a strong password. Pulsar sends a verification) Tj
0 -20 Td
(email; click the link within 24 hours to activate the workspace.) Tj
0 -40 Td
(2. First dashboard) Tj
0 -20 Td
(After verification, the onboarding wizard asks you to connect) Tj
0 -20 Td
(your first data source (Postgres, Snowflake, BigQuery, or CSV)) Tj
0 -20 Td
(and pick a starter template. The default template renders a) Tj
0 -20 Td
(revenue-by-week chart and a churn cohort table.) Tj
0 -40 Td
(3. Invite teammates) Tj
0 -20 Td
(Open Workspace > Members and click Invite. Enter email) Tj
0 -20 Td
(addresses and assign a role: Viewer, Editor, or Admin. Invited) Tj
0 -20 Td
(users receive an email with a one-time join link valid for 7) Tj
0 -20 Td
(days. The free Starter plan allows up to 3 members.) Tj
0 -40 Td
(4. Single sign-on) Tj
0 -20 Td
(Business and Enterprise plans can enable SSO via Workspace >) Tj
0 -20 Td
(Security > SSO. Pulsar supports SAML 2.0 and OIDC. After) Tj
0 -20 Td
(enabling SSO, new members must sign in through your IdP; the) Tj
0 -20 Td
(email/password path is disabled for the workspace.) Tj
0 -40 Td
(5. Get help) Tj
0 -20 Td
(From the app, click the question-mark icon to chat with Astra,) Tj
0 -20 Td
(Pulsar's in-app support agent, or email support@pulsaranalytics.io.) Tj
0 -20 Td
(Enterprise customers have a dedicated account manager reachable) Tj
0 -20 Td
(through the in-app support widget.) Tj
ET`);

// 2. Admin guide
writePage('02-admin-guide.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Workspace Admin Guide) Tj
0 -20 Td
(Effective from May 2026) Tj
0 -40 Td
(1. Workspace settings) Tj
0 -20 Td
(Workspace > Settings is where admins change the workspace) Tj
0 -20 Td
(name, logo, default timezone, and billing contact. Changes) Tj
0 -20 Td
(propagate to all members within a minute.) Tj
0 -40 Td
(2. Roles and permissions) Tj
0 -20 Td
(Pulsar has three roles: Viewer (read-only dashboards),) Tj
0 -20 Td
(Editor (create and edit dashboards, cannot manage members)) Tj
0 -20 Td
(and Admin (full workspace control, including billing). Custom) Tj
0 -20 Td
(roles with granular permissions are available on the Enterprise) Tj
0 -20 Td
(plan only.) Tj
0 -40 Td
(3. Audit log) Tj
0 -20 Td
(Workspace > Audit log records every admin and editor action:) Tj
0 -20 Td
(member invites, role changes, dashboard publications, data) Tj
0 -20 Td
(source additions, and query exports. Entries are retained for) Tj
0 -20 Td
(90 days on Starter/Team and 365 days on Business/Enterprise.) Tj
0 -40 Td
(4. Data sources) Tj
0 -20 Td
(Workspace > Data sources lets admins connect, test, and remove) Tj
0 -20 Td
(data warehouse connections. Pulsar stores credentials encrypted) Tj
0 -20 Td
(at rest with envelope encryption; admins can rotate the workspace) Tj
0 -20 Td
(master key from the same page.) Tj
0 -40 Td
(5. Account recovery) Tj
0 -20 Td
(Admins can transfer workspace ownership to another member from) Tj
0 -20 Td
(Workspace > Settings > Ownership. The new owner must accept the) Tj
0 -20 Td
(transfer within 7 days, after which the original owner loses admin) Tj
0 -20 Td
(privileges.) Tj
ET`);

// 3. API reference
writePage('03-api-reference.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - REST API Reference) Tj
0 -20 Td
(Version 2026-05) Tj
0 -40 Td
(1. Authentication) Tj
0 -20 Td
(All requests authenticate with a bearer token issued from) Tj
0 -20 Td
(Workspace > Settings > API tokens. Tokens are scoped to a) Tj
0 -20 Td
(single workspace and inherit the issuing user's role. Pass the) Tj
0 -20 Td
(token in the Authorization header: Authorization: Bearer <token>.) Tj
0 -40 Td
(2. Rate limits) Tj
0 -20 Td
(The default rate limit is 60 requests per minute per token) Tj
0 -20 Td
(across the REST API and 600 requests per minute per workspace) Tj
0 -20 Td
(across all tokens. The /v1/query endpoint is capped at 10) Tj
0 -20 Td
(requests per minute per token. Rate-limited responses return) Tj
0 -20 Td
(HTTP 429 with a Retry-After header in seconds.) Tj
0 -40 Td
(3. Endpoints) Tj
0 -20 Td
(GET /v1/dashboards - list dashboards in the workspace.) Tj
0 -20 Td
(POST /v1/dashboards - create a new dashboard from a JSON spec.) Tj
0 -20 Td
(GET /v1/dashboards/{id} - retrieve a dashboard by id.) Tj
0 -20 Td
(PATCH /v1/dashboards/{id} - update title, layout, or filters.) Tj
0 -20 Td
(POST /v1/query - run an ad-hoc SQL query against the workspace's) Tj
0 -20 Td
(data sources; returns up to 10 000 rows.) Tj
0 -40 Td
(4. Webhooks) Tj
0 -20 Td
(Pulsar emits webhooks for the following events: dashboard) Tj
0 -20 Td
(published, dashboard shared, query failed, data source health) Tj
0 -20 Td
(degraded, and member invited. Configure webhook URLs in) Tj
0 -20 Td
(Workspace > Settings > Webhooks. Pulsar signs each delivery) Tj
0 -20 Td
(with HMAC-SHA256; verify the X-Pulsar-Signature header.) Tj
0 -40 Td
(5. SDKs) Tj
0 -20 Td
(Official SDKs are available for TypeScript, Python, and Go.) Tj
0 -20 Td
(All three expose the same surface: dashboards.list, dashboards) Tj
0 -20 Td
(.create, query.run. The SDKs retry idempotent requests up to) Tj
0 -20 Td
(three times with exponential backoff on 5xx responses.) Tj
ET`);

// 4. Billing and plans
writePage('04-billing-and-plans.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Billing and Plans) Tj
0 -20 Td
(Updated May 2026) Tj
0 -40 Td
(1. Plan tiers) Tj
0 -20 Td
(Pulsar offers four plan tiers:) Tj
0 -20 Td
(  Starter: free, up to 3 members, 1 GB data, 30-day history.) Tj
0 -20 Td
(  Team: USD 49 per member per month, unlimited dashboards, 1-year) Tj
0 -20 Td
(history, email support.) Tj
0 -20 Td
(  Business: USD 99 per member per month, SSO, audit log 365 days,) Tj
0 -20 Td
(SLA 99.9 percent, priority support.) Tj
0 -20 Td
(  Enterprise: custom pricing, custom roles, dedicated infra,) Tj
0 -20 Td
(SLA 99.99 percent, dedicated CSM.) Tj
0 -40 Td
(2. Invoices) Tj
0 -20 Td
(Invoices are issued on the first of each month for the previous) Tj
0 -20 Td
(month. Download them from Workspace > Billing > Invoices.) Tj
0 -20 Td
(Each invoice lists every line item, the unit price, and the) Tj
0 -20 Td
(applicable tax for your billing address.) Tj
0 -40 Td
(3. Payment methods) Tj
0 -20 Td
(Pulsar accepts Visa, Mastercard, American Express, and ACH) Tj
0 -20 Td
(direct debit. Enterprise customers can pay by wire transfer with) Tj
0 -20 Td
(net-30 terms. Add a payment method from Workspace > Billing >) Tj
0 -20 Td
(Payment method.) Tj
0 -40 Td
(4. Failed payments and dunning) Tj
0 -20 Td
(If a charge fails, Pulsar retries the card on day 3 and day 7,) Tj
0 -20 Td
(sending an email to the billing contact each time. On day 14) Tj
0 -20 Td
(the workspace is downgraded to read-only; on day 30 the workspace) Tj
0 -20 Td
(is suspended. Update the card to restore access immediately.) Tj
0 -40 Td
(5. Cancellation) Tj
0 -20 Td
(Cancel anytime from Workspace > Billing > Plan. The workspace) Tj
0 -20 Td
(remains active until the end of the current billing period. After) Tj
0 -20 Td
(cancellation, data is retained for 30 days and then permanently) Tj
0 -20 Td
(deleted. Download an export before cancelling if you need it.) Tj
0 -40 Td
(6. Plan changes) Tj
0 -20 Td
(Upgrades take effect immediately and are pro-rated. Downgrades) Tj
0 -20 Td
(take effect at the next billing date; the workspace keeps its) Tj
0 -20 Td
(current features until then.) Tj
ET`);

// 5. Account and security
writePage('05-account-and-security.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Account and Security) Tj
0 -20 Td
(Member-facing - Effective May 2026) Tj
0 -40 Td
(1. Change your password) Tj
0 -20 Td
(Open Settings > Security > Password. Enter your current password) Tj
0 -20 Td
(and then a new password of at least 12 characters. Pulsar) Tj
0 -20 Td
(enforces one uppercase, one lowercase, one digit, and one symbol.) Tj
0 -20 Td
(After saving, all other sessions are signed out automatically.) Tj
0 -40 Td
(2. Two-factor authentication) Tj
0 -20 Td
(Settings > Security > Two-factor authentication. Pulsar supports) Tj
0 -20 Td
(TOTP authenticator apps (Google Authenticator, 1Password, Authy)) Tj
0 -20 Td
(and hardware keys (FIDO2 / WebAuthn). Once enabled, sign-in) Tj
0 -20 Td
(requires both your password and a 6-digit code from your device.) Tj
0 -40 Td
(3. Session management) Tj
0 -20 Td
(Settings > Security > Active sessions lists every device and) Tj
0 -20 Td
(browser where you are signed in, with the IP, location, and last) Tj
0 -20 Td
(active time. Click Sign out to end any individual session, or) Tj
0 -20 Td
(Sign out everywhere to end all sessions except this one.) Tj
0 -40 Td
(4. API tokens) Tj
0 -20 Td
(Settings > Security > API tokens. Create a token with a name and) Tj
0 -20 Td
(scope (read-only, read-write, or admin). Pulsar shows the token) Tj
0 -20 Td
(value once at creation; copy and store it securely. Revoke a) Tj
0 -20 Td
(token at any time from the same page.) Tj
0 -40 Td
(5. Lost 2FA device) Tj
0 -20 Td
(If you lose the device that holds your 2FA codes, you can use a) Tj
0 -20 Td
(saved recovery code to sign in. Each member gets ten recovery) Tj
0 -20 Td
(codes at 2FA setup; each code works once. If you have used all) Tj
0 -20 Td
(of your recovery codes, contact support and a security engineer) Tj
0 -20 Td
(will verify your identity and reset 2FA on the workspace within) Tj
0 -20 Td
(1 business hour. The bot will open a security ticket for you) Tj
0 -20 Td
(automatically.) Tj
0 -40 Td
(6. IP allow-list) Tj
0 -20 Td
(Business and Enterprise admins can restrict workspace access) Tj
0 -20 Td
(to a list of IP ranges from Settings > Security > IP allow-list.) Tj
0 -20 Td
(Changes take effect within 5 minutes; members outside the list) Tj
0 -20 Td
(see a 403 error on sign-in.) Tj
ET`);

// 6. Troubleshooting
writePage('06-troubleshooting.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Troubleshooting Guide) Tj
0 -20 Td
(Version 1.8 - May 2026) Tj
0 -40 Td
(1. Common errors) Tj
0 -20 Td
(Dashboard shows "stale": the underlying data source has not) Tj
0 -20 Td
(refreshed. Open the dashboard, click the data-source name in the) Tj
0 -20 Td
(footer, and choose Refresh now. See the data-and-integrations) Tj
0 -20 Td
(guide for refresh cadence defaults.) Tj
0 -40 Td
(Query failed with 429: the workspace is rate-limited. Wait for) Tj
0 -20 Td
(the time indicated in the Retry-After header (usually 30 to 60) Tj
0 -20 Td
(seconds) and retry. If you repeatedly hit 429, contact support to) Tj
0 -20 Td
(raise your workspace quota.) Tj
0 -40 Td
(Sign-in loop: your session cookie is stale. Sign out from the) Tj
0 -20 Td
(account menu, then sign back in. If the loop persists, clear the) Tj
0 -20 Td
(browser cookies for app.pulsaranalytics.io and try again.) Tj
0 -40 Td
(2. Status page) Tj
0 -20 Td
(Live system status is at status.pulsaranalytics.io. Pulsar posts) Tj
0 -20 Td
(incidents, planned maintenance, and historical uptime there.) Tj
0 -20 Td
(Subscribe with email or Slack to receive notifications.) Tj
0 -40 Td
(3. Diagnostic info) Tj
0 -20 Td
(When you contact support, please include your workspace id) Tj
0 -20 Td
(found in Settings > General, your account email, the time of the) Tj
0 -20 Td
(issue (with timezone), and a screenshot of the error toast.) Tj
0 -40 Td
(4. Support contact) Tj
0 -20 Td
(Starter: community forum only.) Tj
0 -20 Td
(Team: email support, 1 business day response.) Tj
0 -20 Td
(Business: priority email, 4 business hour response.) Tj
0 -20 Td
(Enterprise: dedicated CSM, 1 business hour response, 24x7) Tj
0 -20 Td
(for severity 1 incidents).) Tj
0 -40 Td
(5. Reporting a security issue) Tj
0 -20 Td
(Email security@pulsaranalytics.io or use the in-app Report a) Tj
0 -20 Td
(security issue link from the help menu. Pulsar's security team) Tj
0 -20 Td
(acknowledges within 1 business hour and aims to remediate) Tj
0 -20 Td
(within 24 hours for high-severity findings.) Tj
ET`);

// 7. Data and integrations
writePage('07-data-and-integrations.pdf', `BT
/F1 12 Tf
50 750 Td
(Pulsar Analytics - Data Sources and Integrations) Tj
0 -20 Td
(Effective May 2026) Tj
0 -40 Td
(1. Supported data sources) Tj
0 -20 Td
(Pulsar connects to managed Postgres (Neon, Supabase, RDS),) Tj
0 -20 Td
(Snowflake, BigQuery, Databricks, Redshift, and uploaded CSV.) Tj
0 -20 Td
(Each connection is configured in Workspace > Data sources and) Tj
0 -20 Td
(can be tested from the same page.) Tj
0 -40 Td
(2. Refresh cadence) Tj
0 -20 Td
(Each data source has a refresh schedule. The default is every 1) Tj
0 -20 Td
(hour for warehouse sources and every 15 minutes for Postgres) Tj
0 -20 Td
(replicas. Change the cadence from the data source's edit page.) Tj
0 -20 Td
(Schedules as fast as every 5 minutes are available on Business) Tj
0 -20 Td
(and Enterprise plans.) Tj
0 -40 Td
(3. Schema drift) Tj
0 -20 Td
(When a connected table adds, removes, or renames a column,) Tj
0 -20 Td
(Pulsar flags the dashboard with a yellow warning banner. Click the) Tj
0 -20 Td
(banner to view a diff and either accept the change (which updates) Tj
0 -20 Td
(the dashboard's query automatically) or pin the dashboard to) Tj
0 -20 Td
(the previous schema until you fix it manually.) Tj
0 -40 Td
(4. Stale data) Tj
0 -20 Td
(If a dashboard is showing older values than expected, the cause) Tj
0 -20 Td
(is almost always one of: (a) the warehouse has not received new) Tj
0 -20 Td
(rows since the last refresh; (b) the refresh schedule is set to) Tj
0 -20 Td
(daily instead of hourly; (c) the source credential has expired and) Tj
0 -20 Td
(the connection is in a failed state. Open Workspace > Data) Tj
0 -20 Td
(sources to inspect status and last-run timestamps.) Tj
0 -40 Td
(5. Webhooks and outbound events) Tj
0 -20 Td
(See the API reference for the full list of webhooks Pulsar) Tj
0 -20 Td
(emits. The most common for downstream automation are:) Tj
0 -20 Td
(dashboard.published, query.failed, datasource.health.degraded.) Tj
0 -20 Td
(All three are signed with HMAC-SHA256.) Tj
0 -40 Td
(6. Limits) Tj
0 -20 Td
(Per query: 10 000 rows returned, 60 second timeout, 1 GB scanned.) Tj
0 -20 Td
(Per dashboard: 50 tiles. Per workspace: 500 dashboards on Team,) Tj
0 -20 Td
(unlimited on Business and Enterprise.) Tj
ET`);

console.log('All Pulsar Analytics fixtures generated.');
