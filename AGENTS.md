# Agent Instructions

This is a pnpm monorepo. Use `pnpm` for installs, scripts, and workspace commands. Do not use Bun, npm, or yarn unless the user explicitly asks.

## Repository Shape

- Applications live in `apps/*`.
- Shared packages live in `packages/*`.
- Repo-local agent skills live in `.agents/skills/*`.
- Skill-specific reference material lives inside the relevant `.agents/skills/*/references/*` directory.
- Use `docs/*` only for human-facing project docs that are not skill references.

## Working Principles

Use these repo-wide behavior rules when writing, reviewing, or refactoring code:

- Think before coding. State assumptions when they matter, surface tradeoffs, and ask when the request is genuinely ambiguous.
- Choose the simplest change that satisfies the request. Avoid speculative features, broad configurability, and abstractions that only have one use.
- Make surgical edits. Touch the files and lines required for the task, match existing style, and leave unrelated cleanup for a separate request.
- Clean up only the unused imports, variables, functions, or files made obsolete by your own change.
- Define verifiable success criteria for non-trivial work before implementing, then loop until those checks pass or a blocker is clear.
- For bug fixes, prefer a failing reproduction before the fix when practical.
- For refactors, preserve behavior and verify before and after when practical.
- Every changed line should trace back to the user's request, the repo instructions, or required verification.

## Coding Standards

For TypeScript work, use the repo-local `typescript-standards` skill in `.agents/skills/typescript-standards`.

That skill owns the coding standards reference at `.agents/skills/typescript-standards/references/coding-standards.md`. Do not keep or look for a separate TypeScript standards copy in `docs/`.

Use the standards as repo-wide guidance for:

- error handling and typed failures
- parsing and boundary validation
- domain types, branded values, and state modeling
- service/module boundaries
- dependency interfaces and adapters
- testing strategy
- TypeScript safety rules

Prefer established local code patterns first. Apply the standards to new or touched code without forcing broad migrations unless the user explicitly requests one.

## Effect Guidance

This repo uses Effect. For Effect-specific work, use the repo-local `effect-ts` skill in `.agents/skills/effect-ts`.

The Effect skill resolves source through `opensrc`; missing `opensrc` is an environment setup failure.
