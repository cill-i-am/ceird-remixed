---
name: typescript-standards
description: Use whenever writing, reviewing, refactoring, testing, or designing TypeScript in this repository, including Effect code, schemas, domain models, services, adapters, error handling, module boundaries, and test strategy; enforce repo coding standards, typed failures, parse-dont-validate, branded/domain types, surgical changes, and behavior-focused tests.
---

# TypeScript Standards

Use this skill to apply this repository's TypeScript design and safety standards. Keep changes consistent with established local patterns unless they conflict with correctness, safety, or debuggability.

## Required Reading

For non-trivial TypeScript design, implementation, review, refactoring, testing strategy, or unfamiliar code paths, read `./references/coding-standards.md` before editing.

For tiny localized edits, apply the checklist below and read the reference if a decision touches errors, schemas, domain modeling, services, adapters, tests, or module boundaries.

When the work uses Effect, also use the repo-local `effect-ts` skill. Prefer Effect for expected failures and dependency boundaries in Effect code.

## Workflow

1. Inspect nearby code for established conventions around errors, schema parsing, dependency injection, testing, observability, adapters, and module layout.
2. Define the smallest verifiable change that satisfies the request.
3. Apply the standards to new or touched code without forcing broad migrations.
4. Verify with the most relevant available checks.
5. If a standard conflicts with current code, preserve compatibility at the boundary and mention the tradeoff.

## Core Checklist

- Prefer errors as values for expected domain, parsing, authorization, integration, I/O, persistence, and workflow failures.
- Parse early at untrusted boundaries and carry refined/domain types inward.
- Make illegal states unrepresentable with tagged unions, branded/refined types, smart constructors, and explicit state models.
- Keep framework, protocol, database, and external API details in entrypoint or infrastructure adapters.
- Use deep, cohesive modules with low caller burden; avoid pass-through wrappers and speculative abstractions.
- Depend on the narrowest meaningful interface a module needs; let concrete adapters be wider.
- Avoid repository-per-table by default; persistence adapters should expose meaningful domain operations and typed errors.
- Prefer functional core and imperative shell: keep domain behavior free from hidden I/O, ambient time, randomness, and framework concerns.
- Keep workflows idempotent when retries are possible; do not hold database transactions across network calls.
- Test behavior through real seams. Avoid module mocks and spy-driven tests unless the interaction is the only observable behavior.
- Use strict, immutable TypeScript where practical. Avoid `any`, non-null assertions, and casts except for justified boundary or generic cases.
- Keep edits surgical. Every changed line should trace to the user request, these instructions, or required verification.

## Reference

- `./references/coding-standards.md`
