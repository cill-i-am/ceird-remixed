# Database Package Instructions

These instructions apply to `packages/db/*` and refine the repository root
`AGENTS.md`.

## Schema And Migrations

- Treat Drizzle schema files in this package as the source of truth for the
  database contract. Better Auth and API runtime code consume this schema; they
  must not own a separate database or migration universe.
- Generate migrations from Drizzle schema with Drizzle Kit or Alchemy
  `Drizzle.Schema`. Commit the generated migration SQL together with Drizzle
  snapshot metadata so future changes can be diffed from the schema history.
- Do not hand-roll SQL migrations for normal schema changes in this greenfield
  app. Hand-written SQL is allowed only when the schema tool cannot express the
  required database feature; when that happens, document why it is unavoidable
  in the migration and keep the Drizzle schema aligned.
- Keep browser-consumable exports domain-safe. Do not import Alchemy, provider
  modules, `pg`, Hyperdrive runtime code, or other server-only infrastructure
  from package entrypoints that web/client code can reach.
