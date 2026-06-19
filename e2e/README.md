# End-to-end tests

Playwright specs for `/chat` and `/admin`. These exercise the full RAG
flow — sending a question, getting a citation, escalating to a ticket —
against a real Neon branch.

## Status: disabled in CI

The CI e2e step is currently commented out in `.github/workflows/ci.yml`.
See the `TODO :)` block there for the full list of reasons.

## Running locally

The e2e suite is still runnable by hand once the underlying issues are
fixed:

```bash
# 1. Make sure the dev server can start (env vars in .env.local).
# 2. Provision a test branch + seed it:
pnpm setup-test-db

# 3. Run the e2e suite (the dev server is started automatically
#    by Playwright's webServer config):
pnpm e2e
```

To skip the branch provisioning step (e.g. when you already have a
test DB up):

```bash
SKIP_E2E_SETUP=1 pnpm e2e
```

## What's blocking re-enable

- **Neon 423 race**: `scripts/setup-test-db.ts` now waits for the
  branch to reach `ready` and retries the endpoint create on 423,
  but the Neon free plan's 10-branch limit is hit quickly when CI
  runs on every push. Either upgrade the plan, prune branches on
  a schedule, or switch to a single long-lived test branch.
- **Corrupted `sample.pdf`**: `scripts/fixtures/sample.pdf` is a
  known-bad PDF (returns "bad XRef entry" from pdfjs). Replace
  with a valid PDF or remove it from the fixtures dir.
