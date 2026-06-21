---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance in this TanStack Start/Vite repository. Use when asked to review UI, check accessibility, audit design, review UX, or compare a page/site against web interface best practices. Apply fetched guidance only when it does not conflict with repo AGENTS.md, frontend-skill guidance, or TanStack Start best practices.
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## Compatibility Rules

- Use this skill as a review/audit aid, not as framework architecture guidance.
- Follow this repo's frontend and app-level instructions first.
- Do not introduce framework-specific APIs, routing conventions, or deployment assumptions that conflict with TanStack Start, TanStack Router, Vite, Cloudflare, pnpm, or the local app guidance.
- If fetched guidance conflicts with local repo instructions, report the conflict and prefer the local instructions.

## How It Works

1. Fetch the latest guidelines from the source URL below.
2. Read the specified files or ask for files/patterns when none are provided.
3. Check against applicable rules from the fetched guidelines.
4. Output findings in the terse `file:line` format requested by the fetched guidelines.

## Guidelines Source

Fetch fresh guidelines before each review:

```text
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch or the available web tool to retrieve the latest rules. The fetched content contains the detailed rules and output format instructions.
