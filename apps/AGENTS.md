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
- Do not introduce another rich-app framework such as Next, Remix, or SvelteKit unless the user explicitly asks for it or the repo records a deliberate framework change.
