import type { HealthResponse } from "@ceird/api-contract";
import * as Effect from "effect/Effect";
import { createEffectQuery } from "effect-query";
import { ApiClient, makeApiClientLive } from "../api-client";
import type { ApiBaseUrl } from "../public-config-schema";

/** API health state rendered by the web app. */
export type ApiHealthStatus =
  | {
      readonly _tag: "Healthy";
      readonly service: HealthResponse["service"];
      readonly status: HealthResponse["status"];
    }
  | {
      readonly _tag: "Unhealthy";
      readonly message: string;
    };

const apiMetaQueryKey = ["api", "meta"] as const;

/** Query keys for API metadata endpoints. */
export const metaQueryKeys = {
  all: apiMetaQueryKey,
  health: (apiBaseUrl: ApiBaseUrl) =>
    [...apiMetaQueryKey, "health", apiBaseUrl.href] as const,
};

/** How often API health should be refetched in the browser. */
export const apiHealthRefetchInterval = 30 * 1000;

const unhealthyApiHealthStatus: ApiHealthStatus = {
  _tag: "Unhealthy",
  message: "API health check failed.",
};

const loadApiHealthStatus = Effect.fn("loadApiHealthStatus")(() =>
  Effect.gen(function* () {
    const client = yield* ApiClient;
    const response = yield* client.Meta.health();

    return {
      _tag: "Healthy",
      service: response.service,
      status: response.status,
    } satisfies ApiHealthStatus;
  }),
);

const makeMetaEffectQuery = (
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation?: typeof fetch,
) => createEffectQuery(makeApiClientLive(apiBaseUrl, fetchImplementation));

type MetaEffectQuery = ReturnType<typeof makeMetaEffectQuery>;

const defaultMetaEffectQueries = new Map<string, MetaEffectQuery>();
const injectedFetchMetaEffectQueries = new WeakMap<
  typeof fetch,
  Map<string, MetaEffectQuery>
>();

function getMetaEffectQuery(
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation?: typeof fetch,
) {
  const baseUrlKey = apiBaseUrl.href;

  if (fetchImplementation === undefined) {
    const cachedEffectQuery = defaultMetaEffectQueries.get(baseUrlKey);
    if (cachedEffectQuery !== undefined) {
      return cachedEffectQuery;
    }

    const effectQuery = makeMetaEffectQuery(apiBaseUrl);
    defaultMetaEffectQueries.set(baseUrlKey, effectQuery);
    return effectQuery;
  }

  let effectQueriesByBaseUrl =
    injectedFetchMetaEffectQueries.get(fetchImplementation);
  if (effectQueriesByBaseUrl === undefined) {
    effectQueriesByBaseUrl = new Map<string, MetaEffectQuery>();
    injectedFetchMetaEffectQueries.set(
      fetchImplementation,
      effectQueriesByBaseUrl,
    );
  }

  const cachedEffectQuery = effectQueriesByBaseUrl.get(baseUrlKey);
  if (cachedEffectQuery !== undefined) {
    return cachedEffectQuery;
  }

  const effectQuery = makeMetaEffectQuery(apiBaseUrl, fetchImplementation);
  effectQueriesByBaseUrl.set(baseUrlKey, effectQuery);
  return effectQuery;
}

/** TanStack Query options for API metadata endpoints. */
export const metaQueries = {
  health: (
    options: Readonly<{ apiBaseUrl: ApiBaseUrl; fetch?: typeof fetch }>,
  ) => {
    const effectQuery = getMetaEffectQuery(options.apiBaseUrl, options.fetch);

    return effectQuery.queryOptions({
      queryKey: metaQueryKeys.health(options.apiBaseUrl),
      refetchInterval: apiHealthRefetchInterval,
      queryFn: () =>
        loadApiHealthStatus().pipe(
          Effect.match({
            onFailure: () => unhealthyApiHealthStatus,
            onSuccess: (status) => status,
          }),
        ),
    });
  },
} as const;
