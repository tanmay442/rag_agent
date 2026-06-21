// Lines for 01-getting-started.pdf — the content block for
// the customer-support RAG fixture "Pulsar Analytics - Getting Started Guide".
// Re-render with `renderPdf` from this package; this file is
// pure data, no pdf-lib import.
export const lines: readonly string[] = [

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
  
];
