# Handoff Protocol

This document defines how context flows from one agent session to the
next. Every agent must follow this protocol.

## Dev Environment Check (Every Session, First Thing)

Before doing any work, every agent must verify the dev environment has
the tools needed. Run this check block at the start:

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # confirm clean working tree (no uncommitted changes)
```

If any tool is missing or the working tree is dirty, **stop and inform
the developer** before proceeding. Do not attempt to install tools
yourself.

---

## Context Handoff Format

When an agent completes its session, it must write a file to:

```
docs/effect-migration/context/after-session-NN.md
```

where `NN` is the zero-padded session number (e.g., `after-session-01.md`).

### Required Sections in the Handoff File

```markdown
# Context After Session NN: <session title>

## What Was Done

- <bullet list of every file created, modified, or deleted>
- <bullet list of every dependency added or removed>
- <bullet list of any schema or type changes>

## What Changed in the Codebase Structure

- <new services, new layers, new files, renamed files, deleted files>
- <anything the next agent needs to know about where things moved>

## Gotchas / Things to Watch Out For

- <edge cases, test failures encountered, workarounds applied>
- <any TODOs left for the next session>
- <any API changes the next session's callsites must adapt to>

## Validation Results

- `pnpm typecheck`: <pass/fail>
- `pnpm lint`: <pass/fail>
- `pnpm test`: <pass/fail> (note test count)
- `pnpm arch`: <pass/fail>
- `pnpm build`: <pass/fail/N/A> (sessions 3, 6, 8 only)

## What the Next Agent Should Know

- <2-5 sentences summarizing the current state>
- <which files the next agent should read first>
- <any patterns or conventions established in this session>
```

---

## How to Pass Context to the Next Agent

When you start the next session's agent, give it:

1. **The next session file** (e.g., `session-02-domain-errors.md`)
2. **The previous session's handoff file** (e.g., `context/after-session-01.md`)

The agent should read the handoff file first, then the session file.

---

## Validation After Every Session

Every session must end with these **four standard checks**. The agent
must run all four and report results in the handoff file. If any fail,
the agent must fix the issue before completing the session.

```bash
pnpm typecheck    # tsc --noEmit — must pass with zero errors
pnpm lint         # eslint — must pass with zero errors
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser — architecture boundary check must pass
```

**Additional checks for sessions 3, 6, and 8:**

Sessions 3, 6, and 8 change route handlers, composition, and build
behavior. These sessions must also run `pnpm build` (Next.js build) to
verify the production build still succeeds:

```bash
pnpm build        # Next.js build — must succeed (sessions 3, 6, 8 only)
```

If `pnpm build` fails, check:
- Route handler return types: must return `Promise<Response>` or `Response`
- `Effect.runPromise` must return a `Response`, not raw data
- Server actions must return serializable objects (no `Effect` instances)

If a session introduces new code that isn't covered by existing tests,
the agent should add tests for the new code. The test count should not
decrease from one session to the next.

---

## Git Commit Strategy

Each agent session must produce **one commit** at the end, after all
validation passes.

### Commit Rules

1. **One commit per session.** Stage only the files changed in that
   session (plus any new files). Do not stage unrelated changes.
2. **Commit only after all four validation checks pass.** If any fail,
   fix them before committing. Never commit broken code.
3. **Do not push.** The developer pushes when ready.
4. **Do not create branches or PRs.** Commit on the current branch.
5. **Do not amend or force-push.** If the commit fails, fix the issue
   and create a new commit.
6. **Do not commit the handoff context file.** Write it to
   `docs/effect-migration/context/` but do NOT stage it. The handoff
   file is a transient artifact. `docs/effect-migration/context/` is
   in `.gitignore`.

### Commit Author

Every commit in this plan must use this author:

```
Author: tanmay442 <goeltanmay442@gmail.com>
```

Set this for each commit using:

```bash
git commit --author="tanmay442 <goeltanmay442@gmail.com>" -m "..."
```

Do NOT change the global or local git config. Use `--author` per
commit.

### Commit Message Format

```
(effect-NN): <short description>

<2-4 line summary of key changes>

Validation: typecheck ✓, lint ✓, test ✓, arch ✓[, build ✓]
```

Add `build ✓` only for sessions 3, 6, and 8 which run `pnpm build`.

Example:
```
(effect-01): add Effect tooling, update arch rules, add branded IDs

Install @effect/vitest, @effect/platform, @effect/platform-node.
Update dependency-cruiser to allow effect everywhere and ban zod.
Create branded ID types (DocumentId, TicketId, ClerkUserId, etc).

Validation: typecheck ✓, lint ✓, test ✓, arch ✓
```

Example with build (sessions 3, 6, 8):
```
(effect-03): replace Result with Effect, ports with Context.Service

The big migration: remove Result<T,E> union type, use Effect<A,E,R>
everywhere. Replace port interfaces with Context.Service definitions.
Convert all repository implementations to Effect.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓, build ✓
```

### What to Stage

Stage:
- All files created in this session
- All files modified in this session
- The updated `docs/effect-migration/context/.gitkeep` if needed

Do NOT stage:
- `docs/effect-migration/context/after-session-NN.md` (handoff file)
- `node_modules/`
- `.env.local`
- Any file not touched by this session

### .gitignore Update (Session 1 Only)

The first agent must add this line to `.gitignore`:

```
docs/effect-migration/context/
```

And remove the old line:
```
docs/execution-plan/
```

---

## When to Stop and Ask the Developer

An agent must stop and inform the developer if:

- A tool is missing from the dev environment.
- The working tree has uncommitted changes from a prior session that
  conflict.
- A test fails and the agent cannot determine whether it's a regression
  from the current session or a pre-existing issue.
- The session file references a file that doesn't exist.
- The agent needs to make a decision that changes the architecture in
  a way not described in the session file.

---

## Effect-Specific Conventions

All agents working on this migration should follow these conventions:

1. **Use `Effect.gen` for composition.** Not `Effect.zip`, `Effect.forEach`
   for multi-step workflows — `Effect.gen` is more readable.
2. **Use `Effect.fn` for named functions.** Provides tracing and better
   error messages. Pattern: `const myFunc = Effect.fn("MyFunc.name")(function* () { ... })`.
3. **Use `Effect.tryPromise` for wrapping external SDKs.** Always provide
   a `catch` function that maps to a domain error.
4. **Use `Effect.catchTag` / `Effect.catchTags` at boundaries.** Routes
   and actions catch specific error types and map to HTTP responses.
5. **Use `Schema.TaggedError` for all errors.** Never `new Error(...)`.
   Always `new SomeError({ message: "..." })`.
6. **Use `Context.Service` for services.** Not `Context.Tag` + manual
   implementation. Pattern: `class Foo extends Context.Service<Foo, { ... }>()("@app/Foo") {}`.
7. **Use `Layer.effect` for live layers.** Pattern: `static readonly layer = Layer.effect(Foo, Effect.gen(function* () { ... }))`.
8. **Provide services at module scope.** Don't scatter `Effect.provide`
   calls. Assemble the layer once in composition.ts, provide at entry.
9. **No `Effect.runPromise` inside business logic.** Only at boundaries
   (route handlers, server actions, scripts).
10. **Never use `Effect.runPromiseExit` in production code.** Only in
    tests or when you need to inspect the exit value.
