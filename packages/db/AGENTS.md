# Database Package Instructions

These instructions apply to `packages/db/*` and refine the repository root
`AGENTS.md`.

## Schema And Migrations

- Treat Drizzle schema files in this package as the source of truth for the
  database contract. Better Auth and API runtime code consume this schema; they
  must not own a separate database or migration universe.
- Derive row-shaped Effect Schemas from Drizzle tables with
  `drizzle-orm/effect-schema`. Do not duplicate Effect Schema definitions for
  select, insert, or update shapes that mirror database rows. Hand-written
  Effect Schemas remain appropriate for domain models and public view models
  when they intentionally differ from table shape.
- When first-party API/database services grow beyond the Better Auth adapter,
  use `drizzle-orm/effect-postgres` for Effect-native Postgres access behind
  the app's DB service boundary. Better Auth may keep the regular Drizzle
  adapter it requires, but application services should not scatter raw
  promise-based driver access through Effect handlers.
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
