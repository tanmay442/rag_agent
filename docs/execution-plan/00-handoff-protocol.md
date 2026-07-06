# Handoff Protocol

This document defines how context flows from one agent session to the
next. Every agent must follow this protocol.

## Dev Environment Check (Every Session, First Thing)

Before doing any work, every agent must verify the dev environment has
the tools needed for that session. Run this check block at the start:

```bash
node --version          # must be >= 20
pnpm --version          # must be >= 10
git status              # confirm clean working tree (no uncommitted changes)
```

If any tool is missing or the working tree is dirty, **stop and inform
the developer** before proceeding. Do not attempt to install tools
yourself.

Some sessions need additional checks (e.g., Docker, Ollama). Those are
listed in the session file's "Dev Environment Check" section.

## Context Handoff Format

When an agent completes its session, it must write a file to:

```
docs/execution-plan/context/after-session-NN.md
```

where `NN` is the zero-padded session number (e.g., `after-session-01.md`).

### Required Sections in the Handoff File

```markdown
# Context After Session NN: <session title>

## What Was Done

- <bullet list of every file created, modified, or deleted>
- <bullet list of every env var added or changed>
- <bullet list of every migration or schema change>
- <bullet list of every new dependency added or removed>

## New Env Vars Introduced

| Var | Required? | Default | Purpose |
|-----|-----------|---------|---------|
| ... | yes/no    | ...     | ...     |

## Schema / Migration Changes

- <list any new migrations, their filenames, and what they do>

## What Changed in the Codebase Structure

- <new ports, new adapters, new routes, renamed files, etc.>
- <anything the next agent needs to know about where things moved>

## Gotchas / Things to Watch Out For

- <any edge cases, test failures encountered, workarounds applied>
- <any TODOs left for a future session>

## Validation Results

- `pnpm typecheck`: <pass/fail>
- `pnpm lint`: <pass/fail>
- `pnpm test`: <pass/fail> (note any skipped/changed tests)
- `pnpm arch`: <pass/fail>

## What the Next Agent Should Know

- <2-5 sentences summarizing the current state of the codebase>
- <any context the next agent needs that isn't obvious from the code>
- <which files the next agent should read first>
```

## How to Pass Context to the Next Agent

When you (the developer) start the next session's agent, give it:

1. **The next session file** (e.g., `session-02-llm-providers.md`)
2. **The previous session's handoff file** (e.g.,
   `context/after-session-01.md`)

The agent should read the handoff file first, then the session file.
The session file's instructions assume the prior sessions are complete.

## Validation After Every Session

Every session must end with these four checks. The agent must run all
four and report results in the handoff file. If any fail, the agent
must fix the issue before completing the session.

```bash
pnpm typecheck    # tsc --noEmit — must pass with zero errors
pnpm lint         # eslint — must pass with zero errors
pnpm test         # vitest run — all tests must pass
pnpm arch         # dependency-cruiser — architecture boundary check must pass
```

If a session introduces new code that isn't covered by existing tests,
the agent should add tests for the new code. The test count should not
decrease from one session to the next.

## Git Commit Strategy

Each agent session must produce **one commit** at the end, after all
validation passes. The commit strategy is:

### Commit Rules

1. **One commit per session.** Stage only the files changed in that
   session (plus any new files). Do not stage unrelated changes.
2. **Commit only after all four validation checks pass** (`pnpm
   typecheck`, `pnpm lint`, `pnpm test`, `pnpm arch`). If any fail,
   fix them before committing. Never commit broken code.
3. **Do not push.** The developer pushes when ready.
4. **Do not create branches or PRs.** Commit on the current branch.
5. **Do not amend or force-push.** If the commit fails, fix the issue
   and create a new commit.
6. **Do not commit the handoff context file** — it is written to
   `docs/execution-plan/context/` but should NOT be staged. The
   handoff file is a transient artifact for the next agent, not part
   of the codebase history. Add `docs/execution-plan/context/` to
   `.gitignore` (the first agent should do this).

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
(session-NN): <short description of what was done>

<2-4 line summary of the key changes>

Validation: typecheck ✓, lint ✓, test ✓, arch ✓
```

Example:
```
(session-01): swap pg Pool for @neondatabase/serverless

Replace node-postgres with Neon serverless driver for
connectionless HTTP fetch. Remove unconditional sslmode injection.
Edge-runtime compatible, no pool exhaustion under fan-out.

Validation: typecheck ✓, lint ✓, test ✓, arch ✓
```

### What to Stage

Stage:
- All files created in this session
- All files modified in this session

Do NOT stage:
- `docs/execution-plan/context/after-session-NN.md` (handoff file)
- `node_modules/`
- `.env.local`
- Any file not touched by this session

### .gitignore Update (Session 1 Only)

The first agent must add this line to `.gitignore`:

```
docs/execution-plan/context/
```

This ensures handoff context files don't pollute git history.

## When to Stop and Ask the Developer

An agent must stop and inform the developer (rather than guessing) if:

- A tool is missing from the dev environment.
- The working tree has uncommitted changes from a prior session that
  conflict.
- A test fails and the agent cannot determine whether it's a regression
  from the current session or a pre-existing issue.
- The session file references a file that doesn't exist (prior session
  may not have completed successfully).
- The agent needs to make a decision that changes the architecture in a
  way not described in the session file.
