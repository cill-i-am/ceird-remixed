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
- API authentication belongs at the API/auth layer so public API, MCP server, mobile, and third-party clients share one auth boundary. The API database is Neon Postgres fronted by Cloudflare Hyperdrive and declared through the root Alchemy stack.

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
- Use one typed API client and one domain-scoped TanStack Query facade for app-facing API reads. The typed Effect HttpApi client layer owns the shared `@ceird/api-contract` contract, transport, retries, tracing headers, and response decoding. Domain query modules own TanStack Query options, query keys, UI cache policy, and conversion into plain view models.
- Route loaders and components should consume the query facade, for example `apiQueries.meta.health(...)`, `apiQueries.sites.list(...)`, or `apiQueries.issues.detail(...)`. Do not grow a flat bag of endpoint-specific query helpers such as `apiHealthQueryOptions`, `sitesListQueryOptions`, and `issuesDetailQueryOptions` as the primary app API.
- Keep query keys explicit and domain-scoped in the same module as the query factory so invalidation stays discoverable when mutations arrive. The facade should stay stable even when the underlying runtime transport changes.
- Apply automatic HTTP retries conservatively at the typed client or transport boundary. Retry transient `GET` requests by default; do not retry mutations unless the command has an explicit idempotency strategy such as an idempotency key, natural unique constraint, deduplication record, state-transition guard, or outbox/inbox.
- Do not introduce another rich-app framework such as Next, Remix, or SvelteKit unless the user explicitly asks for it or the repo records a deliberate framework change.

### API Transport Boundaries

Browser API calls use the public API URL. TanStack Start SSR calls should use the app Worker's server-only service binding to the API Worker. Both transports must be hidden behind the typed API client so routes and components never choose transport directly.

## Design System

- Shared UI primitives live in `packages/ui` and are consumed as `@ceird/ui`.
- The shared UI package is shadcn/Base UI-backed, not Radix-backed. Use Base UI composition APIs such as `render`, `nativeButton={false}` for non-button renders, and Base-specific Select, ToggleGroup, Slider, and Accordion semantics.
- Add or update shadcn primitives through the app config so files route into the shared package: `pnpm dlx shadcn@latest add <component> -c apps/app`.
- Keep generated primitives in `packages/ui/src/components/*`, shared UI utilities in `packages/ui/src/lib/*`, and global shadcn/Tailwind tokens in `packages/ui/src/styles/globals.css`.
- App routes and feature components should use `@ceird/ui` primitives and semantic design tokens instead of hand-rolled status spans or raw color classes when a shared primitive exists.
- Shared packages must keep source exports for local HMR and use `tsdown` for package builds so apps can consume package source during development without a prebuild step.

## Public Config And Alchemy Inputs

- Prefer Alchemy stack wiring for app-to-app resource values. For example, a root stack may pass an API Worker URL into `Cloudflare.Vite` through a server-side env binding such as `env: { API_URL: api.url.as<string>() }`.
- Do not bake mutable stack-derived values into browser bundles with `VITE_*` when the app may need to swap them without a rebuild. Read those values on the TanStack Start server side and expose only the allowed public subset to the browser.
- Model server config with one Effect Schema source of truth. Derive client-visible config from that schema with an explicit allowlist, for example `ServerConfigSchema.mapFields(({ apiBaseUrl }) => ({ apiBaseUrl }))`; do not duplicate parallel server/public schemas by hand.
- Treat public config as a boundary crossing. Decode and brand values with Effect Schema before use, and use role-specific branded types for URL-shaped values such as `ApiBaseUrl`, `AppBaseUrl`, or `AssetBaseUrl`.
- Keep the public config wire shape plain and serializable for TanStack Start and TanStack Query hydration. Brand and parse at the boundary; do not pass rich runtime objects such as resources, clients, schema classes, or errors through router serialization.
- Missing or invalid required config should fail the server function/loader and crash loudly. Do not render fallback states for required stack wiring.
- Cache runtime public config deliberately. The app server may cache config in memory with a short TTL, and the browser should mirror that policy with TanStack Query `staleTime`/`refetchInterval` when config can change out of band.
- Routes, loaders, server functions, and UI components should consume parsed config values from the config module, not read `process.env` or `import.meta.env` directly.
