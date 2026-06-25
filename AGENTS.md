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

## Oracle Second Opinions

Oracle is installed on this machine as `oracle`, with `oracle-mcp` available for MCP clients. Use Oracle when a task would benefit from a second-model review with real repo context: subtle bugs, architectural tradeoffs, security or reliability reviews, risky refactors, confusing failures, or "I'm stuck" moments.

- Run `oracle --help` once per session before first use.
- Prefer the installed `oracle` binary in this repo. If it is unavailable, use `pnpm dlx @steipete/oracle` instead of `npx`.
- Start with a dry run before sending context: `oracle --dry-run summary --files-report -p "<question>" --file "<paths>"`.
- Include a concise project briefing in the prompt: pnpm monorepo, `apps/*`, `packages/*`, TypeScript, Effect, relevant build/test commands, and the constraints that matter.
- Attach the relevant `AGENTS.md` files, configs, source files, tests, and docs. Prefer a tight file set over whole-repo dumps.
- Do not attach secrets or local state, including `.env*`, key files, credentials, cookies, tokens, or user data.
- Treat Oracle output as advisory. Verify recommendations against local code, types, tests, and these repo instructions before implementing.
- Get explicit user consent before API runs such as `--engine api` or `--models`, because they can incur provider costs. Browser, dry-run, and render/copy flows do not need cost approval.
- If a run detaches, times out, or a matching prompt is already active, use `oracle status --hours 72` and `oracle session <id> --render`; do not start duplicate runs unless the user asks.
- Use `oracle --render --copy -p "<question>" --file "<paths>"` when browser automation or API access is blocked and manual paste is the safest path.

## Coding Standards

For TypeScript work, use the repo-local `coding-standards` skill in `.agents/skills/coding-standards`.

That skill owns the coding standards references in `.agents/skills/coding-standards/*`. Do not keep or look for a separate TypeScript standards copy in `docs/`.

Use the standards as repo-wide guidance for:

- error handling and typed failures
- parsing and boundary validation
- domain types, branded values, and state modeling
- service/module boundaries
- dependency interfaces and adapters
- testing strategy
- TypeScript safety rules

Prefer established local code patterns first. Apply the standards to new or touched code without forcing broad migrations unless the user explicitly requests one.

## Boundary Type Safety

When values cross a boundary, parse them immediately and carry the parsed domain type inward.

- Treat environment variables, Vite `import.meta.env`, request payloads, URL params, headers, cookies, database rows, queue messages, webhook payloads, and Alchemy-provided runtime values as boundary input.
- Do not pass raw strings, numbers, booleans, or loosely typed DTOs deeper into the app when the value has domain meaning.
- Prefer Effect Schema for boundary parsing in this repo. Use schema transformations for representation changes, such as string-to-`URL`.
- Use branded or opaque types for meaningful primitives such as URLs, IDs, slugs, stages, flags, currency, durations, and resource names.
- Brand values after the parser proves the invariant. Do not use casts, assertions, or ambient TypeScript declarations to "earn" a brand.
- Missing or invalid required config is startup misconfiguration. Fail fast at the app or Worker boundary instead of rendering fallback UI or inventing defaults.
- Keep parsed config in a small boundary module or Effect Layer. Application code should consume typed values such as `ApiBaseUrl`, not `string | undefined`.
- If a value is sensitive, keep it redacted at the boundary and unwrap it only inside the adapter that needs the raw secret.

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
