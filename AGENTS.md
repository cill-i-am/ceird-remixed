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

## Deployment Model

Use trunk-based deployment. Do not introduce a separate long-lived staging environment that gates production unless the user explicitly asks for that topology.

- Treat `main` as the deployable trunk.
- Deploy `main` to the `prod` Alchemy stage through CI after checks pass.
- Create one short-lived Alchemy stage per pull request, named `pr-<number>`, and destroy it when the PR closes.
- Use feature flags to ship incomplete, experimental, risky, or user-specific behavior safely.
- Keep feature flags explicit, typed where practical, and default-off for unfinished behavior.
- Prefer small, continuously integrated changes over long-lived branches or environment promotion workflows.
- Use local/developer Alchemy stages such as `dev_$USER` only for development, testing, and Cloudflare-backed local iteration.
- Do not create a persistent `staging` stage or parallel production-like stack by default.
- PR stages are preview environments, not release gates. They should be cleanup-safe and should not become part of the production release path.
- CI should run checks for branches, deploy PR stages for same-repository pull requests, clean up closed PR stages, and deploy from trunk only after the required checks pass.

## Effect Guidance

This repo uses Effect. For Effect-specific work, use the repo-local `effect-ts` skill in `.agents/skills/effect-ts`.

The Effect skill resolves source through `opensrc`; missing `opensrc` is an environment setup failure.
