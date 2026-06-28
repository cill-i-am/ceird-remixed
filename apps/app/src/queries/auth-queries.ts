import type { QueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@ceird/api-contract";
import * as Effect from "effect/Effect";
import { createEffectQuery } from "effect-query";
import { ApiClient, makeApiClientLive } from "../api-client";
import type { ApiBaseUrl } from "../public-config-schema";

/** Anonymous app session state. */
export type AnonymousSession = {
  readonly _tag: "Anonymous";
};

/** Authenticated app session state backed by the API principal view. */
export type AuthenticatedSession = {
  readonly _tag: "Authenticated";
  readonly user: MeResponse;
};

/** Client-visible app session state. */
export type Session = AnonymousSession | AuthenticatedSession;

const anonymousSession: AnonymousSession = {
  _tag: "Anonymous",
};

const apiAuthQueryKey = ["api", "auth"] as const;

/** Query keys for API-backed auth/session endpoints. */
export const authQueryKeys = {
  all: apiAuthQueryKey,
  session: (apiBaseUrl: ApiBaseUrl) =>
    [...apiAuthQueryKey, "session", apiBaseUrl.href] as const,
};

const loadSession = Effect.fn("loadSession")(() =>
  Effect.gen(function* () {
    const client = yield* ApiClient;
    const user = yield* client.Meta.me();

    return {
      _tag: "Authenticated",
      user,
    } satisfies Session;
  }).pipe(
    Effect.catchTag("Unauthorized", () => Effect.succeed(anonymousSession)),
  ),
);

const makeAuthEffectQuery = (
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation?: typeof fetch,
) => createEffectQuery(makeApiClientLive(apiBaseUrl, fetchImplementation));

type AuthEffectQuery = ReturnType<typeof makeAuthEffectQuery>;

const defaultAuthEffectQueries = new Map<string, AuthEffectQuery>();
const injectedFetchAuthEffectQueries = new WeakMap<
  typeof fetch,
  Map<string, AuthEffectQuery>
>();

function getAuthEffectQuery(
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation?: typeof fetch,
) {
  const baseUrlKey = apiBaseUrl.href;

  if (fetchImplementation === undefined) {
    const cachedEffectQuery = defaultAuthEffectQueries.get(baseUrlKey);
    if (cachedEffectQuery !== undefined) {
      return cachedEffectQuery;
    }

    const effectQuery = makeAuthEffectQuery(apiBaseUrl);
    defaultAuthEffectQueries.set(baseUrlKey, effectQuery);
    return effectQuery;
  }

  let effectQueriesByBaseUrl =
    injectedFetchAuthEffectQueries.get(fetchImplementation);
  if (effectQueriesByBaseUrl === undefined) {
    effectQueriesByBaseUrl = new Map<string, AuthEffectQuery>();
    injectedFetchAuthEffectQueries.set(
      fetchImplementation,
      effectQueriesByBaseUrl,
    );
  }

  const cachedEffectQuery = effectQueriesByBaseUrl.get(baseUrlKey);
  if (cachedEffectQuery !== undefined) {
    return cachedEffectQuery;
  }

  const effectQuery = makeAuthEffectQuery(apiBaseUrl, fetchImplementation);
  effectQueriesByBaseUrl.set(baseUrlKey, effectQuery);
  return effectQuery;
}

/** TanStack Query options for API-backed auth/session endpoints. */
export const authQueries = {
  session: (
    options: Readonly<{ apiBaseUrl: ApiBaseUrl; fetch?: typeof fetch }>,
  ) => {
    const effectQuery = getAuthEffectQuery(options.apiBaseUrl, options.fetch);

    return effectQuery.queryOptions({
      queryKey: authQueryKeys.session(options.apiBaseUrl),
      retry: false,
      queryFn: () => loadSession(),
    });
  },
} as const;

/** Refresh the browser-visible app session after Better Auth mutations. */
export async function refreshAuthSession(
  queryClient: QueryClient,
  apiBaseUrl: ApiBaseUrl,
) {
  const queryKey = authQueryKeys.session(apiBaseUrl);

  await queryClient.invalidateQueries({ exact: true, queryKey });
  return queryClient.fetchQuery(authQueries.session({ apiBaseUrl }));
}
