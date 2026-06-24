# Auth Database Follow-Ups

This branch keeps the first Better Auth slice deliberately small. Two database
infrastructure items remain intentional follow-ups before broad schema work:

- **Drizzle migration drift check:** `packages/db/src/schema.ts` and
  `packages/db/migrations/0000_better_auth.sql` are maintained together by
  review today. Before adding more tables, normalize this to an Alchemy
  `Drizzle.Schema` baseline or add a deterministic CI drift check that proves
  the checked-in SQL still matches the shared Drizzle schema.
- **Non-prod Neon topology:** each non-prod stage currently creates isolated
  Neon resources. That is simple for this auth slice, but can become expensive
  or quota-prone. Move dev/PR stages to branches under a shared non-prod Neon
  project once the shared project lifecycle and cleanup policy are agreed.
- **Preview deploy credentials:** GitHub Actions uses separate `preview` and
  `production` environments. Configure preview Cloudflare, Neon, Better Auth,
  and GitHub credentials as least-privilege non-production credentials; do not
  reuse production secrets in the preview environment.
- **DNS/domain cutover:** this branch intentionally uses `api.ceird.app` and
  `app.ceird.app` for production, plus exact `api-<stage>.ceird.app` and
  `app-<stage>.ceird.app` preview routes. Ensure the Cloudflare zone has the
  matching proxied DNS/routes before deploy. A temporary
  `remixed-api.ceird.app` compatibility alias is not included in this slice.
