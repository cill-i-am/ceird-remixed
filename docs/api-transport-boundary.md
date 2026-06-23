# API Transport Boundary

The app has one typed API client and one domain-scoped TanStack Query facade. Routes and components call the facade, for example `apiQueries.meta.health(...)`, and never decide whether an API request should use public HTTP fetch or a service binding.

## Runtime Selection

Browser requests use the public API URL and the browser `fetch` implementation. TanStack Start SSR requests use the app Worker's server-only `API_WORKER` service binding, with the typed API client still owning endpoint contracts, response decoding, retries, and tracing.

The runtime split lives in `apps/app/src/api-runtime-fetch.ts` and `apps/app/src/api-runtime-fetch.server.ts`. Keep that split hidden behind `makeApiClientLive` so app routes, loaders, and components remain transport-agnostic.

## TanStack Start Stub Import

`createIsomorphicFn` is imported directly from `@tanstack/start-fn-stubs` instead of the root `@tanstack/react-start` export. The root export re-exports the same primitive, but it also pulls server modules into the Vitest browser dependency graph when the TanStack Start compiler is not active.

Keeping the smaller stub package as an explicit dependency makes browser tests exercise the client transport without bundling server-only modules. Revisit this if TanStack Start exposes a client-safe public subpath for `createIsomorphicFn`, or if the browser test setup starts running through the Start compiler.

## Header Forwarding

The service-binding transport forwards only explicit auth and trace headers. It must not forward the browser or SSR request `cookie` header wholesale to the API Worker. If the API needs cookie-derived identity later, add a narrow, documented header or token handoff instead of expanding the generic forwarding allowlist.
