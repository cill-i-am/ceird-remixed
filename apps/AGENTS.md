# Application Instructions

These instructions apply to `apps/*` and refine the repository root `AGENTS.md`.

## Application Boundaries

- Treat each directory under `apps/*` as a deployable or runnable application boundary.
- Keep app packages focused on entrypoints, routing, runtime wiring, and user-facing workflows.
- Move reusable domain logic, shared contracts, and cross-application utilities into `packages/*` when they are needed by more than one app.

## HTTP APIs

- Use Effect HttpApi for HTTP APIs by default.
- Model routes, payloads, responses, and typed errors with Effect HttpApi, HttpApiGroup, HttpApiEndpoint, and Schema.
- Assemble handlers with HttpApiBuilder and provide platform/router layers at the Worker or server entrypoint.
- For Cloudflare Worker APIs, prefer an Effect Worker that returns the HttpApi router effect over ad hoc `fetch` path routing.
- Keep one-off manual `fetch` handlers limited to temporary smoke tests or tiny probes; migrate them before expanding the API surface.

## RPC

- Use Effect RPC for RPC clients and service-to-service RPC contracts.
- Share typed RPC contracts and schemas between client and server instead of hand-rolling fetch clients.
- Keep RPC transport and runtime wiring at the app boundary; application and domain code should depend on typed services or contracts.

## Rich Web Applications

- Use TanStack Start for rich web applications.
- Keep TanStack Start routing, loaders, server functions, and app-shell concerns inside the web app package.
- Put reusable UI primitives, domain models, API contracts, and shared client helpers in `packages/*` when they need to cross app boundaries.
- Return plain serializable view models from TanStack loaders and server functions. Decode with Effect Schema at boundaries, but do not pass schema class instances, errors, resources, or other rich runtime objects through router serialization.
- When using TanStack Query with TanStack Start, use the official router SSR query integration. Create a fresh `QueryClient` inside `getRouter`, put it in router context, prefetch critical data in loaders with `queryClient.ensureQueryData`, and read that data in components with `useSuspenseQuery`.
- Keep loader prefetch functions narrow: `await queryClient.ensureQueryData(...)` without returning the data when the component reads it from TanStack Query. This keeps route-tree type inference smaller as the app grows.
- Keep transport concerns out of components and route loaders. Effect HttpApi contracts own endpoint types and schemas; Effect HttpClient/FetchHttpClient layers own fetch, transient retries, timeouts, tracing, and rate limiting; TanStack Query owns UI cache policy, stale time, SSR hydration, polling/refetch intervals, and focus-driven refetching.
- Apply automatic HTTP retries conservatively at the typed client or transport boundary. Retry transient `GET` requests by default; do not retry mutations unless the command has an explicit idempotency strategy such as an idempotency key, natural unique constraint, deduplication record, state-transition guard, or outbox/inbox.
- Do not introduce another rich-app framework such as Next, Remix, or SvelteKit unless the user explicitly asks for it or the repo records a deliberate framework change.

## Public Config And Alchemy Inputs

- Prefer Alchemy stack wiring for app-to-app resource values. For example, a root stack may pass an API Worker URL into `Cloudflare.Vite` through `env: { VITE_API_URL: api.url.as<string>() }`.
- Treat Vite `VITE_*` values as public build/runtime inputs, not as trusted domain values.
- Define required `VITE_*` keys in `vite-env.d.ts` for editor and compile-time feedback, but do not rely on type declarations for runtime safety.
- Parse required public config once at the app boundary with Effect Schema, then export parsed/branded values from a precise config module.
- Use `Schema.URLFromString` for URL-shaped env values, then brand the decoded `URL` by role, such as `ApiBaseUrl`, `AppBaseUrl`, or `AssetBaseUrl`.
- Do not render fallback states for missing required config. Missing Alchemy-provided public config should fail the app early so broken stack wiring is obvious.
- Routes, loaders, server functions, and UI components should consume parsed config values, not read `import.meta.env` directly.
