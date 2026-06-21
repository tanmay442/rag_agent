// Lines for 03-api-reference.pdf — the content block for
// the customer-support RAG fixture "Pulsar Analytics - API Reference".
// Re-render with `renderPdf` from this package; this file is
// pure data, no pdf-lib import.
export const lines: readonly string[] = [

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
  
];
