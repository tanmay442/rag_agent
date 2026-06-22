# Tech Debt: Deferred Large Refactors

Items identified by `npx fallow` as high-complexity targets that were
intentionally deferred from the fallow-optimization pass. These are
real maintainability concerns but require careful decomposition rather
than mechanical dedup.

## Current state (after fallow optimisation)

- Dead code: 0% · Dead exports: 0% · Code duplication: 0% (≥3 instances)
- MI: 93.6 · Lint: 0 errors, 0 warnings
- Unused deps: 0 · Unlisted deps: 0
- Only remaining: 28 complexity items (all listed below)

## 1. src/app/api/chat/route.ts — POST handler (274 lines, cyclomatic 13, cognitive 18)

**Status:** TODO
**Priority:** High
**Why deferred:** Chat is the core feature; splitting the streamText +
tool definitions + rate limiting + citation post-processing requires
careful integration testing.

Suggested decomposition:
- `streamChatResponse()` — the streamText call with model + tools
- `buildChatTools()` — the createSupportTicket + searchDocumentation tool defs
- `emitCitations()` — the post-loop data-citation wrapper
- `POST()` — top-level: auth, rate limit, call above, return stream

## 2. src/components/ChatInterface.tsx (382 lines)

**Status:** TODO
**Priority:** High
**Why deferred:** Large React component with 2 parents; splitting risks
breaking the streaming/transport wiring. Needs Storybook or visual
regression tests first.

Suggested decomposition:
- `ChatMessageList` — message rendering + auto-scroll
- `ChatInput` — input box + send button + form state
- `ChatSidebar` — the sidebar/right panel
- `ChatInterface` — composes the above + transport state

## 3. src/app/(app)/admin/tickets/page.tsx — TicketsPage (247 lines, cyclomatic 13)

**Status:** TODO
**Priority:** Medium
**Why deferred:** Server component with data fetching + filtering +
modal state. Refactor needs to preserve URL search-param sync.

## 4. src/app/(app)/admin/documents/page.tsx — DocumentsPage (167 lines, cyclomatic 17, CRITICAL)

**Status:** TODO
**Priority:** Medium
**Why deferred:** Highest CRAP score (306.0) in the project. Needs
extraction of the row actions, the recount-all button, and the search/
filter hooks into separate components.

## 5. scripts/setup-test-db.ts — main (215 lines, cyclomatic 26, cognitive 34)

**Status:** TODO
**Priority:** Low
**Why deferred:** CLI script, not on the hot path. Refactor when
the script grows further or when we add a second test-db helper.

## 6. packages/cli/src/commands/init.ts — runInit (152 lines, cyclomatic 22, cognitive 32)

**Status:** TODO
**Priority:** Low
**Why deferred:** CLI command, not on the hot path. Extract
`copyPdfsFromDir()`, `upsertAdminEmails()`, and `renderAndUpload()`
into separate functions when the command grows.

## 7. packages/infrastructure/src/db/client.ts — high-impact (3 dependents) — DONE in 8d65a65

Split into:
- `db/client.ts` (10 LOC): just the drizzle db export + schema re-export
- `db/pool.ts` (52 LOC): buildPool, makeMissingDatabasePool, dotenv/config
- Removed `attachDatabasePool` (dead no-op for legacy parity, no consumers)

MI: 93.4 → 93.5. Fall refactoring target removed from fallow's list.

## 8. src/components/app/AppSidebar.tsx — AppSidebar (182 lines, 8 hooks)

**Status:** TODO
**Priority:** Low
**Why deferred:** UI component with 1 parent. Extract the
`isActive()` helper and the `SidebarBody` sub-component when the
sidebar gains more sections.

## 9. src/app/(app)/admin/tickets/ticket-drawer.tsx — TicketDrawer (161 lines, 8 props)

**Status:** TODO
**Priority:** Low
**Why deferred:** Complex drawer with many props. Extract the
header/body/footer sub-components when the drawer grows.

---

## How to pick this up

Each item is independent. To work on one:
1. Open a branch from `refactor/clean-architecture`
2. Refactor + add tests
3. Run `pnpm typecheck && pnpm lint && pnpm arch && pnpm test && pnpm build`
4. Update this file: move the item to "Done" with the commit SHA

## Done

### 7. packages/infrastructure/src/db/client.ts — high-impact (3 dependents) — DONE in 8d65a65

Split into:
- `db/client.ts` (10 LOC): just the drizzle db export + schema re-export
- `db/pool.ts` (52 LOC): buildPool, makeMissingDatabasePool, dotenv/config
- Removed `attachDatabasePool` (dead no-op for legacy parity, no consumers)
