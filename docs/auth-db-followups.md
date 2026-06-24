# Auth Database Follow-Ups

This branch keeps the first Better Auth slice deliberately small. A few
database infrastructure items remain intentional follow-ups before broad schema
work:

- **Drizzle migration review:** `packages/db/src/schema.ts` is the source of
  truth and migrations are generated through Drizzle Kit/Alchemy
  `Drizzle.Schema`. Before adding more tables, consider a deterministic CI
  check that reruns generation and fails on unexpected migration diffs.
- **Better Auth Drizzle 1.x support:** this branch keeps Better Auth on the
  Drizzle adapter and uses a narrow API-edge bridge so Better Auth can await
  Alchemy's Effect-native Drizzle chains. As of the current package check,
  `@better-auth/drizzle-adapter@1.6.20` still declares `drizzle-orm ^0.45.2`;
  a later `1.7.0-beta.9` also declares `^0.45.2`, while the older wider beta
  is not a stable support path. Revisit when Better Auth publishes a stable
  Drizzle 1.x-compatible adapter, and do not introduce Kysely or another ORM as
  a workaround in this greenfield app.
- **Non-prod Neon topology:** each non-prod stage currently creates isolated
  Neon resources. That is simple for this auth slice, but can become expensive
  or quota-prone. Move dev/PR stages to branches under a shared non-prod Neon
  project once the shared project lifecycle and cleanup policy are agreed.
- **Prod Neon branch protection:** production branch protection is currently
  disabled because the active Neon plan rejects protected branch creation.
  Enable protection before real production data lands, or upgrade/adjust the
  Neon plan so Alchemy can create protected production branches.
- **Request-scoped HttpApi construction:** Better Auth routes skip the Effect
  HttpApi router, but protected non-auth API routes still build the router and
  layers per request. Keep this acceptable for the first slice; revisit a safe
  hoist or cached-router design once there are enough protected routes to
  measure.
- **Preview deploy credentials:** GitHub Actions uses separate `preview` and
  `production` environments. Configure preview Cloudflare, Neon, Better Auth,
  and GitHub credentials as least-privilege non-production credentials; do not
  reuse production secrets in the preview environment.
- **DNS/domain cutover:** this branch intentionally uses `api.ceird.app` and
  `app.ceird.app` for production, plus exact `api-<stage>.ceird.app` and
  `app-<stage>.ceird.app` preview routes. Ensure the Cloudflare zone has the
  matching proxied DNS/routes before deploy. A temporary
  `remixed-api.ceird.app` compatibility alias is not included in this slice.
