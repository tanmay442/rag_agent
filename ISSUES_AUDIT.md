# Code Audit — Issues Detail

Full audit of the `rag_agent` codebase. Each issue documented with problem,
fix, user/architectural impact. No fixes applied yet.

---

## Table of Contents

1. [Critical & Security Issues](#1-critical--security-issues)
2. [Error Handling Issues](#2-error-handling-issues)
3. [Input Validation & Pagination](#3-input-validation--pagination)
4. [API Route Robustness](#4-api-route-robustness)
5. [Architecture & Infrastructure](#5-architecture--infrastructure)
6. [Frontend & UX Issues](#6-frontend--ux-issues)
7. [Accessibility Issues](#7-accessibility-issues)
8. [Styling & Theme Consistency](#8-styling--theme-consistency)
9. [Security Headers](#9-security-headers)
10. [Logging & Observability](#10-logging--observability)
11. [Test Coverage Gaps](#11-test-coverage-gaps)

---

## 1. Critical & Security Issues

### 1.1 `respond()` Returns 200 for Non-Error Thrown Values

**File:** `src/lib/http.ts:41`
**Severity:** HIGH

**Problem:**
The `respond()` function has a final fallback:
```ts
if (result instanceof Response) return result;
return Response.json(result);  // status 200
```
If a route does `catch (err) { return respond(err) }` and `err` is not an
`Error` instance (e.g. a thrown string, `null`, or a plain object), the
function falls through to `Response.json(result)` with HTTP 200. This means
an error is returned as a successful response with status 200, leaking raw
internal values to the client.

**Fix:**
Replace the final fallback with a safe 500 response:
```ts
return Response.json(
  { error: 'Internal server error', code: 'internal_error' },
  { status: 500 },
);
```

**User Impact:**
A broken API route could silently return garbage data with a 200 status,
making it impossible for the frontend to distinguish success from failure.
The client would display invalid data or crash.

**Architecture Impact:**
Every route that uses `respond(err)` in a `catch` block depends on this
function correctly mapping all error types. A silent fallback undermines
the entire error handling contract.

---

### 1.2 Pagination `limit`/`offset` Unbounded — Data Export Risk

**File:** `src/composition.ts:142-152`
**Severity:** HIGH

**Problem:**
`parseQueryPagination()` does no clamping:
```ts
const rawLimit = Number(url.searchParams.get('limit') ?? defaults.limit ?? 25);
return {
  limit: Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25),
  offset: Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0),
};
```
A client can send `?limit=999999999` to dump the entire users table, all
tickets, or all audit events in one request. The `MAX_LIST_LIMIT` constant
(100) exists in `config/constants.ts` but is never enforced at the API layer.

Note: `ticketRepo.list` has a hard cap of 500 at the DB layer, and the
`listTickets` use-case caps at `MAX_LIST_LIMIT`. But `listUsers` and
`listAudit` repository functions do NOT have this defense.

**Fix:**
Clamp in `parseQueryPagination`:
```ts
limit: Math.min(
  Math.max(Math.floor(Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25)), 1),
  MAX_LIST_LIMIT,
),
offset: Math.max(Math.floor(Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0)), 0),
```

**User Impact:**
An attacker or misbehaving client could export the entire user database in
a single request. This is a data exfiltration vector. Even for legitimate
use, a `?limit=999999` request would cause slow queries and high memory
usage on the server.

**Architecture Impact:**
Pagination is a cross-cutting concern. The defense should be in the
composition layer (shared parser) rather than in each repository. This is
the correct place to enforce it, but it must actually be enforced.

---

### 1.3 System Role Accepted from Client — Prompt Injection

**File:** `src/app/api/chat/request-schema.ts:15`
**Severity:** MEDIUM

**Problem:**
The Zod schema accepts `system` role messages from the client:
```ts
role: z.enum(['user', 'assistant', 'system']),
```
A client could inject arbitrary system-level instructions by prepending a
`{ role: 'system', parts: [...] }` message to their chat. The AI SDK's
`convertToModelMessages` may pass system messages to the model as system
prompts, bypassing the server-provided system prompt.

**Fix:**
Restrict to user-facing roles:
```ts
role: z.enum(['user', 'assistant']),
```
Or verify that the AI SDK ignores client-sent system messages in favor of
the server-provided system prompt.

**User Impact:**
A malicious user could override the system prompt, potentially making the
AI reveal internal instructions, bypass safety filters, or behave in
unintended ways. This is a security and safety issue.

**Architecture Impact:**
The system prompt is a server-side concern. Client-sent system messages
should never be trusted. The schema is the first line of defense and
should reject them.

---

### 1.4 No Try/catch Around `comp.*` Calls in 5 Routes

**Files:**
- `src/app/api/admin/tickets/route.ts:12`
- `src/app/api/admin/tickets/[ticketId]/route.ts:25-31`
- `src/app/api/admin/documents/[id]/restore/route.ts:17`
- `src/app/api/admin/audit/route.ts:11-16`
- `src/app/api/admin/users/route.ts:10`

**Severity:** HIGH

**Problem:**
The composition root wraps all use-cases with `bind()` which calls
`.then(unwrap)`. The `unwrap()` function throws the `DomainError` when
the Result is an error. Several routes call `comp.*` methods without
try/catch, meaning thrown DomainErrors propagate as unhandled exceptions,
producing raw 500 responses with potentially leaky stack traces.

By contrast, the document DELETE, impersonate, and role routes DO have
try/catch blocks.

**Fix:**
Wrap all `comp.*` calls in try/catch and pass caught errors to
`respond(err)`:
```ts
try {
  const result = await comp.listTickets({ ... });
  return Response.json(result);
} catch (err) {
  return respond(err);
}
```

**User Impact:**
Unhandled DomainErrors produce raw 500 responses with no structured error
body. The frontend cannot display a meaningful error message. In some
cases, stack traces or internal details may leak.

**Architecture Impact:**
The error handling contract is inconsistent. Some routes handle errors
properly, others don't. This makes it impossible to reason about error
behavior across the API surface.

---

### 1.5 `EMBEDDING_DIMENSION` Env Var Not Validated

**File:** `packages/infrastructure/src/db/schema-vector.ts:3`
**Severity:** HIGH

**Problem:**
```ts
const VECTOR_DIM = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);
```
If `EMBEDDING_DIMENSION` is set to a non-numeric string, `parseInt` returns
`NaN`, and `vector(NaN)` is invalid SQL that crashes at runtime. This
constant is evaluated at module load time and is never validated. It is also
not listed in `.env.example`.

**Fix:**
```ts
const parsed = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);
if (!Number.isFinite(parsed) || parsed <= 0) {
  throw new Error(`Invalid EMBEDDING_DIMENSION: ${process.env.EMBEDDING_DIMENSION}`);
}
const VECTOR_DIM = parsed;
```

**User Impact:**
A misconfigured environment variable would crash the application at
startup with a cryptic SQL error rather than a clear configuration error
message.

**Architecture Impact:**
Environment variables are a form of input. They should be validated at
startup, not deferred to runtime. This is a defense-in-depth concern.

---

### 1.6 `Content-Length` Header Check Is Spoofable

**File:** `src/app/api/chat/route.ts:138-141`
**Severity:** MEDIUM

**Problem:**
```ts
const contentLength = Number(req.headers.get('content-length') ?? '0');
if (contentLength > 1_000_000) {
  return new Response('Request body too large', { status: 413 });
}
```
The `Content-Length` header is client-controlled. An attacker can send
`Content-Length: 100` while transmitting 100MB of body data. `req.json()`
will buffer the entire body into memory before parsing, potentially causing
OOM.

**Fix:**
Remove the spoofable header check or use it as a first-pass optimization
only. Rely on a streaming body-size limiter or AbortController-based
timeout for the real guard. The Zod schema's `.max(100)` on the messages
array provides some protection, but only after the full body is parsed.

**User Impact:**
An attacker could send oversized payloads that exhaust server memory,
causing denial of service for all users.

**Architecture Impact:**
Body size limiting should be handled at the infrastructure level (reverse
proxy, middleware, or streaming parser), not via a spoofable header check.

---

## 2. Error Handling Issues

### 2.1 `toSafeError()` Loses `ValidationError.details`

**File:** `src/lib/http.ts:14-19`
**Severity:** LOW

**Problem:**
The `SAFE_MESSAGES` map returns a generic message for `validation_error`
(`'Invalid input provided'`), discarding the original message AND the
structured `details` field from `ValidationError`. When a caller passes
structured validation issues (e.g., Zod error issues), they are lost:
```ts
return respond(new ValidationError('invalid_role', { issues: parsed.error.issues }));
// The `issues` array is never returned to the client
```

**Fix:**
Include `details` for `ValidationError` in both `toSafeError` and
`respond`:
```ts
if (err instanceof ValidationError) {
  return { error: SAFE_MESSAGES[err.code] ?? err.message, code: err.code, details: err.details };
}
```

**User Impact:**
When validation fails, the client only sees "Invalid input provided"
instead of specific field-level error messages. This degrades the user
experience, especially in forms.

**Architecture Impact:**
The error handling pipeline silently discards structured data. This makes
it harder to build rich error UIs and harder to debug validation failures.

---

### 2.2 Error Messages May Leak Internal Details

**File:** `src/lib/http.ts:16`
**Severity:** LOW

**Problem:**
```ts
return { error: SAFE_MESSAGES[err.code] ?? err.message, code: err.code };
```
When a `DomainError` has a code not in `SAFE_MESSAGES`, the raw
`err.message` is returned. If a use-case includes internal details in its
error message (e.g., `"Document not found: 12345"` or DB connection
strings), these leak to the client.

**Fix:**
Always use `SAFE_MESSAGES[err.code]` as the primary source, falling back
to a generic message rather than `err.message`:
```ts
return { error: SAFE_MESSAGES[err.code] ?? 'An error occurred', code: err.code };
```

**User Impact:**
Internal details like database IDs, connection strings, or file paths
could be exposed in error responses, aiding attackers.

**Architecture Impact:**
The safe error function should be a strict allowlist, not a fallback to
raw messages.

---

### 2.3 Silent Swallow of `req.json()` Parse Errors

**File:** `src/app/api/chat/route.ts:151`
**Severity:** LOW

**Problem:**
```ts
const raw = await req.json().catch(() => null);
```
The `catch(() => null)` discards the original `SyntaxError` (e.g.,
"Unexpected token" in JSON). This makes debugging harder in production
when clients send malformed bodies.

**Fix:**
Log the error:
```ts
const raw = await req.json().catch((e) => {
  logger.debug('JSON parse failed', { error: String(e) });
  return null;
});
```

**User Impact:**
When clients send malformed JSON, the server returns a generic 400 error.
The missing log makes it harder to diagnose client-side issues.

**Architecture Impact:**
Silent error swallowing is an anti-pattern. Errors should be logged even
if they are caught and handled.

---

### 2.4 `console.error` Instead of Logger in `requireAdminRoute`

**File:** `src/composition.ts:137`
**Severity:** LOW

**Problem:**
```ts
console.error('requireAdminRoute failed', err);
```
All other error logging in the codebase uses the structured `logger` from
`src/lib/logger.ts`. This one instance uses raw `console.error`, which
produces unstructured output that cannot be filtered, searched, or
aggregated in production log systems.

**Fix:**
Replace with:
```ts
logger.error('requireAdminRoute failed', { error: String(err) });
```

**User Impact:**
No direct user impact, but unstructured logs make production debugging
slower and more expensive.

**Architecture Impact:**
Inconsistent logging undermines the observability stack. One unstructured
log entry in a sea of structured JSON is a needle-in-a-haystack problem.

---

### 2.5 `toSafeError` Fallback Returns Raw Error for Unknown Codes

**File:** `src/lib/http.ts:16`
**Severity:** LOW

**Problem:**
```ts
return { error: SAFE_MESSAGES[err.code] ?? err.message, code: err.code };
```
If `err.code` is not in `SAFE_MESSAGES` and `err.message` contains
sensitive information (stack trace fragments, internal paths), it is
returned to the client.

**Fix:**
Use a two-tier fallback:
```ts
return {
  error: SAFE_MESSAGES[err.code] ?? 'An error occurred',
  code: err.code,
};
```

**User Impact:**
Sensitive internal details could be exposed in error responses.

**Architecture Impact:**
The safe error function should never leak raw error messages.

---

## 3. Input Validation & Pagination

### 3.1 `parseQueryPagination` Does Not Validate Bounds

**File:** `src/composition.ts:142-152`
**Severity:** MEDIUM

**Problem:**
`parseQueryPagination()` accepts any `Number()` value including negatives
and floats:
```ts
limit: Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25),
offset: Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0),
```
- `?limit=0.5` → float passed to SQL
- `?offset=-1` → negative offset
- `?limit=999999999` → unbounded query

The database layer clamps negatives for tickets but not for users or audit.

**Fix:**
```ts
limit: Math.min(
  Math.max(Math.floor(Number.isFinite(rawLimit) ? rawLimit : (defaults.limit ?? 25)), 1),
  MAX_LIST_LIMIT,
),
offset: Math.max(Math.floor(Number.isFinite(rawOffset) ? rawOffset : (defaults.offset ?? 0)), 0),
```

**User Impact:**
Malformed pagination parameters could cause slow queries, high memory
usage, or unexpected empty results.

**Architecture Impact:**
Pagination is a shared concern. The parser should enforce invariants so
individual routes don't need to.

---

### 3.2 NaN from `Number(params.page)` in 4 Admin Pages

**Files:**
- `src/app/(app)/admin/users/page.tsx:16`
- `src/app/(app)/admin/tickets/page.tsx:23`
- `src/app/(app)/admin/documents/page.tsx:22`
- `src/app/(app)/admin/audit/page.tsx:14`

**Severity:** MEDIUM

**Problem:**
```ts
const page = Math.max(1, Number(params.page ?? 1));
```
If `params.page` is `"abc"`, `Number("abc")` returns `NaN`, and
`Math.max(1, NaN)` returns `NaN`. Then `offset` becomes `NaN`, which
causes the database query to fail or return unexpected results.

**Fix:**
```ts
const raw = Number(params.page ?? 1);
const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
```

**User Impact:**
A user visiting `/admin/users?page=abc` would see a server error instead
of gracefully falling back to page 1.

**Architecture Impact:**
Search params are user input. They must be validated at the boundary, not
assumed to be numeric.

---

### 3.3 `documentId` Parsed Without Validation in Audit Route

**File:** `src/app/api/admin/audit/route.ts:12`
**Severity:** LOW

**Problem:**
```ts
documentId: documentId ? Number(documentId) : undefined,
```
If `documentId` is `"abc"`, `Number("abc")` returns `NaN`. This `NaN` is
passed to a Drizzle SQL template. PostgreSQL will reject `NaN` as an
integer comparison, resulting in a 500 error instead of a 400.

**Fix:**
```ts
if (documentId && !Number.isFinite(Number(documentId))) {
  return respond(new ValidationError('Invalid documentId'));
}
```

**User Impact:**
A user passing `?documentId=abc` gets a 500 instead of a clear 400 error.

**Architecture Impact:**
All numeric query params should be validated before use in queries.

---

### 3.4 No Max-Length on Individual Message Text Parts

**File:** `src/app/api/chat/request-schema.ts:7`
**Severity:** LOW

**Problem:**
```ts
z.object({ type: z.literal('text'), text: z.string() }),
```
A single text part can be arbitrarily large. While the 1MB content-length
check exists (spoofable, see 1.6), the Zod schema itself does not enforce
any limit.

**Fix:**
Add `.max(50_000)` to the `text` field.

**User Impact:**
An attacker could send extremely large text parts, consuming server memory
and potentially causing OOM.

**Architecture Impact:**
Schema validation should enforce all constraints, not rely on external
checks.

---

### 3.5 `assignedTo` Not Validated Against Existing Users

**File:** `src/app/api/admin/tickets/[ticketId]/route.ts:8`
**Severity:** LOW

**Problem:**
```ts
assignedTo: z.string().nullable().optional(),
```
An admin can assign a ticket to any arbitrary string. There is no
validation that the value corresponds to an existing user.

**Fix:**
Validate against the user list or at minimum check format.

**User Impact:**
A typo in the assignee field creates a ticket assigned to a non-existent
user, which could cause confusion or broken UI.

**Architecture Impact:**
Foreign key relationships should be validated at the API layer, not just
at the DB layer (where the constraint may or may not exist).

---

## 4. API Route Robustness

### 4.1 Inconsistent Error Handling Patterns Across Routes

**Severity:** MEDIUM

**Problem:**
The codebase uses three different patterns for error handling in routes:

1. **Try/catch with `respond(err)`** — chat, role, impersonate, document
   delete routes
2. **Result type checking (`result.ok`)** — ticket PATCH, document restore
   routes
3. **No error handling at all** — users list, tickets list, audit list,
   analytics summary routes

This inconsistency makes it harder to reason about error behavior.

**Fix:**
Standardize on one pattern across all routes. Recommended: try/catch with
`respond(err)` since it is the most defensive.

**User Impact:**
Inconsistent error handling means some routes return structured errors,
others return raw 500s, and others return 200 with error bodies. The
frontend cannot reliably handle errors.

**Architecture Impact:**
A consistent pattern is easier to audit, test, and maintain. It also
makes it possible to add cross-cutting concerns (logging, metrics) in one
place.

---

### 4.2 No Rate Limiting on State-Changing Admin Endpoints

**Files:**
- `src/app/api/admin/users/[clerkId]/role/route.ts`
- `src/app/api/admin/users/[clerkId]/impersonate/route.ts`
- `src/app/api/admin/tickets/[ticketId]/route.ts`
- `src/app/api/admin/documents/[id]/route.ts`
- `src/app/api/admin/documents/[id]/restore/route.ts`

**Severity:** LOW

**Problem:**
None of the admin write endpoints have rate limiting. While admin auth is
required, a compromised admin account could rapidly perform destructive
operations (mass role changes, mass impersonation, mass deletion).

**Fix:**
Add rate limiting to write operations, especially impersonation and role
changes.

**User Impact:**
A compromised admin account could cause widespread damage before being
detected.

**Architecture Impact:**
Rate limiting should be applied to all state-changing operations, not just
the chat endpoint.

---

### 4.3 Impersonation Token Has No IP Binding

**File:** `src/app/api/admin/users/[clerkId]/impersonate/route.ts:29`
**Severity:** MEDIUM

**Problem:**
```ts
const signInToken = await client.signInTokens.createSignInToken({
  userId: clerkId, expiresInSeconds: 120,
});
```
The sign-in token grants full account access for 120 seconds with no IP
restriction. If the token URL is intercepted (via logs, network
monitoring), it can be used from any location.

**Fix:**
If Clerk supports IP-binding for sign-in tokens, enable it. At minimum,
ensure the token URL is never logged.

**User Impact:**
A stolen impersonation token could be used from any network, allowing
full account takeover.

**Architecture Impact:**
High-privilege tokens should have multiple layers of protection (expiry,
IP binding, audit logging).

---

### 4.4 No Format Validation on `clerkId` Path Parameter

**Files:**
- `src/app/api/admin/users/[clerkId]/role/route.ts:17`
- `src/app/api/admin/users/[clerkId]/impersonate/route.ts:12`

**Severity:** LOW

**Problem:**
The `clerkId` from the URL path is used directly in DB queries and Clerk
API calls without format validation. While Drizzle parameterizes the
query (no SQL injection), a malformed `clerkId` (extremely long, special
characters) could cause unexpected behavior in the Clerk API.

**Fix:**
Validate: `z.string().min(1).max(255)`.

**User Impact:**
A malformed `clerkId` could cause a 500 error or unexpected Clerk API
behavior.

**Architecture Impact:**
All path parameters should be validated at the route boundary.

---

### 4.5 No Explicit CSRF Protection

**Severity:** MEDIUM

**Problem:**
Admin POST/PATCH/DELETE endpoints rely on Next.js's built-in CSRF
protection (Origin header check) rather than explicit CSRF tokens. For
high-privilege operations like role changes and impersonation, this is
insufficient.

**Fix:**
Implement explicit CSRF tokens or at minimum verify the Origin/Referer
headers against a whitelist.

**User Impact:**
A cross-site request could potentially perform admin operations if the
user is authenticated.

**Architecture Impact:**
High-privilege operations should have explicit CSRF mitigation, not just
implicit browser protections.

---

## 5. Architecture & Infrastructure

### 5.1 Inconsistent Session Resolution — Three Different Paths

**Files:**
- `packages/infrastructure/src/auth/session.ts:75-116`
- `packages/infrastructure/src/auth/clerk-session.ts:9-27`
- `src/proxy.ts:28-52`

**Severity:** MEDIUM

**Problem:**
Three different session resolution approaches exist:

1. `getAppSession()` — upserts user to DB, checks admin emails, promotes
   admins
2. `clerkSessionStore.getSession()` — read-only, does NOT upsert, returns
   stale roles
3. `resolveRole()` — reads from Clerk JWT claims, falls back to Clerk
   Backend SDK, does NOT check DB

The `clerkSessionStore` does not upsert users, so it can return stale
role data from the DB. The proxy reads roles from Clerk JWT metadata,
which can diverge from the DB role if `syncClerkRole` fails silently.

**Fix:**
Consolidate to a single session resolution path. At minimum, document
when each path is used and the tradeoffs.

**User Impact:**
Stale role data could cause a user to see wrong permissions or be denied
access they should have.

**Architecture Impact:**
Multiple session resolution paths create a maintenance nightmare. Each
path has different guarantees (upsert vs read-only, DB vs JWT), making it
hard to reason about auth behavior.

---

### 5.2 `computeAdminEmails()` Called on Every Request

**File:** `packages/infrastructure/src/auth/session.ts:9-15`
**Severity:** MEDIUM

**Problem:**
```ts
function computeAdminEmails(): readonly string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((e) => e && EMAIL_RE.test(e));
}
```
This function re-parses the `ADMIN_EMAILS` env var, splits, trims,
lowercases, and regex-validates on every call. While not a performance
crisis, it is wasteful for a value that never changes at runtime.

**Fix:**
Cache the result in a module-level variable computed once at import time:
```ts
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((e) => e && EMAIL_RE.test(e));
```

**User Impact:**
No direct user impact, but unnecessary CPU overhead on every request.

**Architecture Impact:**
Env var parsing should happen once at startup, not on every request.

---

### 5.3 Infrastructure Package Depends on Application Package

**File:** `packages/infrastructure/package.json:16`
**Severity:** HIGH

**Problem:**
```json
"@app/application": "workspace:*",
```
The infrastructure package has `@app/application` as a dependency, but
the dependency-cruiser rules explicitly forbid `application` from importing
`infrastructure`. The dependency graph should be:
`domain <- application <- infrastructure`.

Having `infrastructure` depend on `application` creates a potential for
circular dependencies.

**Fix:**
Move port interfaces to `@app/domain` or create a `@app/ports` package.
Remove `@app/application` from infrastructure's dependencies.

**User Impact:**
No direct user impact, but circular dependencies can cause subtle bugs
and make the codebase harder to refactor.

**Architecture Impact:**
The clean architecture boundary is violated. This makes it harder to
swap implementations and test in isolation.

---

### 5.4 Transaction Scope Bypassed for Tickets, Users, and Audit List

**File:** `packages/infrastructure/src/db/repositories.ts:162-238, 430-436`
**Severity:** HIGH

**Problem:**
The `ticketRepo` and `userRepo` are singletons that always use the global
`db` connection. They do not accept a `client` parameter like the
document/chunk functions do. When `transactionRunner.run()` is called, it
creates transaction-scoped `documents` and `chunks` repos, but
`ticketRepo` and `userRepo` still use the global connection.

This means ticket and user operations inside a transaction are NOT atomic
with document operations. Similarly, `auditRepo.list()` does NOT pass the
transaction client.

**Fix:**
Make `ticketRepo` and `userRepo` accept an optional `client` parameter.
Pass `client` through in `createAuditRepo.list`.

**User Impact:**
If a document upload fails midway, the ticket and audit entries may have
already been committed, leaving inconsistent state.

**Architecture Impact:**
Transactions that span multiple repositories should use the same database
client. The current design silently breaks atomicity.

---

### 5.5 `listDeletedSince` Always Returns Empty Array

**File:** `packages/infrastructure/src/db/repositories.ts:411`
**Severity:** HIGH

**Problem:**
```ts
listDeletedSince: () => Promise.resolve([]),
```
The `DocumentRepository` interface declares `listDeletedSince(at: Date)`
but both the infrastructure adapter and the composition root stub it out
with a hardcoded empty array. Any code that relies on `listDeletedSince`
(e.g., for trash/bin functionality) silently gets no data.

**Fix:**
Either implement the function in the repository or remove it from the
interface if it is not needed.

**User Impact:**
If the trash/bin feature is implemented, it will never show any deleted
documents.

**Architecture Impact:**
Dead code in interfaces creates false expectations. Stubs that always
return empty arrays are worse than not having the function at all, because
callers assume it works.

---

### 5.6 Duplicate Database Connection Objects

**File:** `packages/infrastructure/src/db/repositories.ts:438-448`
**Severity:** MEDIUM

**Problem:**
The `transactionRunner` creates transaction-scoped repos for documents
and chunks, but `ticketRepo` and `userRepo` are singletons that always
use the global `db` connection. This means some operations are
transactional and others are not, depending on which repository is used.

**Fix:**
Standardize all repositories to accept an optional `client` parameter.
When called within a transaction, pass the transaction client.

**User Impact:**
Inconsistent transaction behavior could lead to data corruption in edge
cases.

**Architecture Impact:**
The transaction boundary should be explicit and consistent across all
repositories.

---

### 5.7 In-Memory Rate Limiter Not Shared Across Instances

**File:** `packages/infrastructure/src/auth/lru-rate-limiter.ts:1-58`
**Severity:** MEDIUM

**Problem:**
The rate limiter uses an in-process `Map`. On Vercel with multiple
concurrent function instances, each instance has its own map. The rate
limit of 30 requests/minute is effectively multiplied by the number of
instances.

**Fix:**
Use an external rate limiter (Redis, Vercel KV, or Upstash) for
production.

**User Impact:**
Rate limiting is ineffective in production, allowing brute-force attacks
to proceed at `limit * N_instances` requests/minute.

**Architecture Impact:**
In-process rate limiting is a development convenience, not a production
solution.

---

### 5.8 In-Memory Query Stats Lost on Cold Start

**File:** `packages/infrastructure/src/auth/in-memory-query-stats.ts:1-87`
**Severity:** MEDIUM

**Problem:**
The query stats store is per-instance and resets on cold start. The
analytics dashboard (`getAnalyticsSummary`) shows incomplete data.

**Fix:**
Persist query stats to the database or an external store for accurate
analytics.

**User Impact:**
Analytics data is incomplete and unreliable after cold starts.

**Architecture Impact:**
In-memory state is lost on deployment. Analytics require durable storage.

---

### 5.9 Drizzle Snapshot Drift

**File:** `drizzle/meta/0000_snapshot.json:256-259`
**Severity:** MEDIUM

**Problem:**
The snapshot records:
```json
"value": "\"ticket_audit\".\"action\" IN ('create','assign','status_change','note','impersonation')"
```
But the schema and migration SQL include `'role_change'`:
```sql
CONSTRAINT "ticket_audit_action_check" CHECK (...)
```
The snapshot is missing `'role_change'` in the CHECK constraint. This
means `drizzle-kit generate` will detect a diff and try to create a new
migration.

**Fix:**
Regenerate the snapshot: `drizzle-kit generate` and commit the updated
snapshot.

**User Impact:**
No direct user impact, but the drift causes confusion during migrations
and could lead to unexpected schema changes.

**Architecture Impact:**
Schema snapshots must be kept in sync with the actual schema. Drift
indicates a process failure.

---

### 5.10 SSL Certificate Verification Disabled in Migration Scripts

**File:** `scripts/apply-migration.mjs:64`
**Severity:** HIGH

**Problem:**
```js
ssl: { rejectUnauthorized: false },
```
This disables TLS certificate verification when connecting to the
database, making the connection vulnerable to man-in-the-middle attacks.
The main application pool correctly uses `sslmode=verify-full`.

**Fix:**
Use `sslmode=verify-full` in migration scripts as well, or at minimum
`sslmode=require`.

**User Impact:**
A MITM attack during migration could intercept database credentials or
modify schema changes.

**Architecture Impact:**
All database connections should use TLS verification. Migration scripts
are not exempt from security requirements.

---

## 6. Frontend & UX Issues

### 6.1 No `loading.tsx` Files Anywhere

**Severity:** CRITICAL UX

**Problem:**
No `loading.tsx` files exist anywhere in the project. Every route group
and page that performs async server-side data fetching has zero loading
indicators. When the server is resolving `requireSession()`,
`requireAdmin()`, or fetching data, the user sees a blank screen or stale
content with no feedback.

Affected pages:
- `(app)/layout.tsx` — auth redirect + data fetch
- `(app)/admin/layout.tsx` — admin guard
- `(app)/admin/page.tsx` — analytics + audit
- `(app)/admin/users/page.tsx` — users list
- `(app)/admin/tickets/page.tsx` — tickets + users
- `(app)/admin/documents/page.tsx` — documents list
- `(app)/admin/audit/page.tsx` — audit events
- `(app)/admin/analytics/page.tsx` — summary + audit
- `(app)/admin/documents/[id]/preview/page.tsx` — document fetch

**Fix:**
Add `loading.tsx` files at each route group with skeleton UIs.

**User Impact:**
Users see blank screens or stale content during data fetches. This is a
poor UX, especially on slow connections.

**Architecture Impact:**
Streaming with `loading.tsx` is a core Next.js feature. Not using it
negates the performance benefits of React Server Components.

---

### 6.2 Missing `not-found.tsx` and `global-error.tsx`

**Severity:** HIGH UX

**Problem:**
- `src/app/not-found.tsx` — MISSING
- `src/app/global-error.tsx` — MISSING
- `src/app/(app)/not-found.tsx` — MISSING
- `src/app/(app)/admin/not-found.tsx` — MISSING

Only one `error.tsx` exists: `src/app/(app)/admin/error.tsx`. There is no
error boundary for the chat page, marketing routes, or root layout.

**Fix:**
Add `not-found.tsx` at root and `(app)/`, and `global-error.tsx` at root.

**User Impact:**
Unhandled errors show raw Next.js default error pages. 404s show a generic
white page with "404". This is unprofessional and unhelpful.

**Architecture Impact:**
Error boundaries are a safety net. Without them, any unhandled error
crashes the entire page with no recovery.

---

### 6.3 NaN Propagation from Search Params

**Files:** (same as 3.2)
**Severity:** MEDIUM

**Problem:** See 3.2.

**Fix:** See 3.2.

**User Impact:**
Visiting `/admin/users?page=abc` causes a server error instead of
gracefully falling back to page 1.

---

### 6.4 `user.name` May Be Null But Treated as Non-Null

**File:** `src/components/app/AppSidebar.tsx:332`
**Severity:** HIGH

**Problem:**
```tsx
{user.name.charAt(0).toUpperCase()}
```
The `AppSidebarUser` interface declares `name: string` (not `string |
null`), but `session.user.name` from Clerk can be `null`. If `user.name`
is `null`, `.charAt(0)` throws a runtime error.

**Fix:**
```tsx
{user.name?.charAt(0).toUpperCase() ?? '?'}
```

**User Impact:**
If a user has no name set in Clerk, the entire sidebar crashes.

**Architecture Impact:**
Null safety should be enforced at the type level and handled at the
render level.

---

### 6.5 Missing `suppressHydrationWarning` on `<html>` Tag

**File:** `src/app/layout.tsx:38`
**Severity:** LOW

**Problem:**
Some browser extensions (Grammarly, password managers) inject attributes
into `<html>`, which can cause hydration mismatches.

**Fix:**
Add `suppressHydrationWarning` to the `<html>` tag.

**User Impact:**
Users with browser extensions may see hydration warning noise in the
console.

**Architecture Impact:**
This is a standard Next.js best practice for production apps.

---

## 7. Accessibility Issues

### 7.1 Missing `aria-label` on Search Forms

**Files:**
- `src/app/(app)/admin/users/page.tsx:27`
- `src/app/(app)/admin/tickets/page.tsx:67-69`
- `src/app/(app)/admin/documents/page.tsx:52`
- `src/app/(app)/admin/audit/page.tsx:28`

**Severity:** MEDIUM

**Problem:**
Search forms lack `aria-label`. Screen readers cannot distinguish this form
from other forms on the page.

**Fix:**
Add `aria-label="Search users"` (or tickets/documents/audit) to each form.

**User Impact:**
Screen reader users cannot identify the purpose of the search form.

---

### 7.2 Missing `aria-label` on Pagination Navigation

**Files:**
- `src/app/(app)/admin/users/page.tsx:113-136`
- `src/app/(app)/admin/tickets/page.tsx:220-248`
- `src/app/(app)/admin/documents/page.tsx:145-172`
- `src/app/(app)/admin/audit/page.tsx:100-128`

**Severity:** MEDIUM

**Problem:**
Pagination sections have no `aria-label`. Screen readers announce them as
generic navigation without purpose.

**Fix:**
Add `aria-label="Pagination"` to each pagination `<nav>`.

**User Impact:**
Screen reader users cannot identify the pagination controls.

---

### 7.3 Missing `aria-label` on Data Tables

**Files:**
- `src/app/(app)/admin/users/page.tsx:44`
- `src/app/(app)/admin/tickets/page.tsx:113-116`
- `src/app/(app)/admin/documents/page.tsx:80`
- `src/app/(app)/admin/audit/page.tsx:51`
- `src/app/(app)/admin/analytics/page.tsx:30`

**Severity:** MEDIUM

**Problem:**
Tables have no `aria-label`. Screen readers announce "table with N
columns" but not its purpose.

**Fix:**
Add `aria-label="Users"` (or tickets/documents/audit/analytics) to each
table.

**User Impact:**
Screen reader users cannot identify what data each table contains.

---

### 7.4 Empty `alt=""` on User Avatar Image

**File:** `src/components/app/AppSidebar.tsx:324`
**Severity:** LOW

**Problem:**
```tsx
<img src={user.imageUrl} alt="" ... />
```
The `alt` is explicitly empty. While acceptable for decorative images, a
user avatar is meaningful to screen readers.

**Fix:**
```tsx
alt={user.name ?? 'User avatar'}
```

**User Impact:**
Screen reader users cannot identify whose avatar is displayed.

---

### 7.5 Missing Focus Trap in Mobile Drawer

**File:** `src/components/app/AppSidebar.tsx:170-172`
**Severity:** MEDIUM

**Problem:**
The TODO comment acknowledges the missing focus trap. Keyboard users can
Tab out of the open mobile drawer into the background content.

**Fix:**
Implement focus trap using `@focus-trap/react` or a manual Tab/Shift+Tab
handler.

**User Impact:**
Keyboard users can accidentally interact with background content while the
drawer is open.

---

### 7.6 Missing Focus Trap in Ticket Overlay

**File:** `src/app/(app)/admin/tickets/ticket-overlay.tsx:26-28`
**Severity:** MEDIUM

**Problem:**
The overlay dialog lacks a focus trap. Keyboard users can Tab out of the
dialog into the background.

**Fix:**
Implement focus trap in the overlay dialog.

**User Impact:**
Keyboard users can accidentally interact with background content while the
overlay is open.

---

### 7.7 Missing `<label>` for Audit Filter Inputs

**File:** `src/app/(app)/admin/audit/page.tsx:29-42`
**Severity:** MEDIUM

**Problem:**
The `documentId` and `ticketId` inputs have placeholder text but no
associated `<label>` element. Screen readers only announce the placeholder,
which disappears on focus.

**Fix:**
Add `<label>` elements with `htmlFor` attributes.

**User Impact:**
Screen reader users cannot identify the purpose of the filter inputs.

---

## 8. Styling & Theme Consistency

### 8.1 Hardcoded `zinc-*` Colors in Tickets Page

**File:** `src/app/(app)/admin/tickets/page.tsx`
**Severity:** MEDIUM

**Problem:**
The tickets page uses hardcoded Tailwind color classes (e.g.,
`border-zinc-300`, `bg-white`, `dark:border-zinc-700`) instead of the CSS
custom property system (`var(--border)`, `var(--surface)`, etc.) used
everywhere else in the app.

This means the tickets page will not match the theme if the dark/light
theme tokens change. Other pages using the same hardcoded values:
- `src/app/(app)/admin/documents/[id]/preview/page.tsx`
- `src/app/(app)/admin/error.tsx`

**Fix:**
Replace hardcoded colors with CSS custom properties for consistency.

**User Impact:**
The tickets page looks visually different from other admin pages. Theme
changes will not apply consistently.

---

## 9. Security Headers

### 9.1 Missing `Strict-Transport-Security` Header

**File:** `next.config.ts`
**Severity:** LOW

**Problem:**
No HSTS header is set. This tells browsers to only use HTTPS, preventing
protocol downgrade attacks.

**Fix:**
Add:
```ts
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
```

**User Impact:**
A network attacker could downgrade the connection to HTTP.

---

### 9.2 Missing `Permissions-Policy` Header

**File:** `next.config.ts`
**Severity:** LOW

**Problem:**
No `Permissions-Policy` header is set. This controls which browser
features the application can use.

**Fix:**
Add:
```ts
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
```

**User Impact:**
The application could potentially access camera, microphone, or
geolocation if a script injection vulnerability exists.

---

## 10. Logging & Observability

### 10.1 Raw `console.*` Calls in Infrastructure Layer

**Files:**
- `packages/infrastructure/src/llm/google-embedding-service-port.ts:29,35,47`
- `packages/application/src/auth/users.ts:31,38`
- `packages/application/src/admin/tickets.ts:85`

**Severity:** LOW

**Problem:**
Raw `console.*` calls produce unstructured text output. The structured
logger at `src/lib/logger.ts` outputs JSON for log aggregation.

**Fix:**
Replace with structured logger calls.

**User Impact:**
No direct user impact, but production debugging is harder without
structured logs.

---

### 10.2 Logger Does Not Serialize Error Objects

**File:** `src/lib/logger.ts:7-18`
**Severity:** LOW

**Problem:**
```ts
const line = JSON.stringify(entry);
```
If `meta` contains an `Error` object, `JSON.stringify` will serialize it
as `{}` (Error properties are not enumerable). Stack traces and error
codes are lost.

**Fix:**
Add error serialization that extracts `message`, `stack`, `code`, and
`cause` from Error objects before JSON serialization.

**User Impact:**
No direct user impact, but error logs are incomplete.

---

## 11. Test Coverage Gaps

**Severity:** MEDIUM

**Missing test coverage for:**
- Rate limiter behavior under concurrent requests
- Ticket ID collision handling (now UUID-based)
- Embedding batch retry logic and failure propagation
- Composition root wiring (adapter to use-case binding)
- Server action error paths (only happy path + 403 tested)
- `sanitizeText()` and `escapeHtml()` utilities
- Session/auth flow (`getAppSession`, `requireAdmin`, `isAdminEmail`)
- Ticket status transition validation
- Document restore logic
- Middleware proxy

**Impact:**
Untested code is a regression risk. The TODO in `config/constants.ts`
acknowledges these gaps.

---

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 0 | 4 | 4 | 0 | 8 |
| Error Handling | 0 | 1 | 1 | 4 | 6 |
| Validation | 0 | 1 | 3 | 2 | 6 |
| API Robustness | 0 | 0 | 3 | 2 | 5 |
| Architecture | 0 | 4 | 4 | 0 | 8 |
| Frontend/UX | 1 | 2 | 2 | 1 | 6 |
| Accessibility | 0 | 0 | 5 | 1 | 6 |
| Styling | 0 | 0 | 1 | 0 | 1 |
| Headers | 0 | 0 | 0 | 2 | 2 |
| Logging | 0 | 0 | 0 | 2 | 2 |
| Tests | 0 | 0 | 1 | 0 | 1 |
| **Total** | **1** | **12** | **24** | **14** | **51** |
