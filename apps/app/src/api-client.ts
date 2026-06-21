import { Api, type HealthResponse } from "@ceird/api-contract";
import { createIsomorphicFn } from "@tanstack/start-fn-stubs";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient";
import * as Schedule from "effect/Schedule";
import { createEffectQuery } from "effect-query";
import type { ApiBaseUrl } from "./public-config-schema";

class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof Api>
>()("ceird/ApiClient") {}

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

const unhealthyApiHealthStatus: ApiHealthStatus = {
  _tag: "Unhealthy",
  message: "API health check failed.",
};

const logApiHealthFailure = (cause: Cause.Cause<unknown>) =>
  Effect.logWarning("API health check failed", {
    cause: Cause.pretty(cause),
  });

const transientGetRequestRetryCount = 2;
const transientGetRequestRetrySchedule = Schedule.exponential(
  "100 millis",
  2,
).pipe(Schedule.jittered);
export const apiHealthRefetchInterval = 30 * 1000;

const isTransientHttpResponse = (
  response: HttpClientResponse.HttpClientResponse,
) =>
  response.status === 408 ||
  response.status === 429 ||
  response.status === 500 ||
  response.status === 502 ||
  response.status === 503 ||
  response.status === 504;

const isTransientHttpClientError = (error: unknown) => {
  if (!HttpClientError.isHttpClientError(error)) {
    return false;
  }

  if (error.reason._tag === "TransportError") {
    return true;
  }

  return (
    error.reason._tag === "StatusCodeError" &&
    isTransientHttpResponse(error.reason.response)
  );
};

const retryTransientGetRequests = (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (effect, request) =>
    request.method === "GET"
      ? effect.pipe(
          Effect.repeat({
            schedule: transientGetRequestRetrySchedule,
            times: transientGetRequestRetryCount,
            while: isTransientHttpResponse,
          }),
          Effect.retry({
            schedule: transientGetRequestRetrySchedule,
            times: transientGetRequestRetryCount,
            while: isTransientHttpClientError,
          }),
        )
      : effect,
  );

function omitUndefinedDuplex(init: RequestInit | undefined) {
  if (
    init === undefined ||
    !("duplex" in init) ||
    Reflect.get(init, "duplex") !== undefined
  ) {
    return init;
  }

  const normalizedInit = { ...init };
  Reflect.deleteProperty(normalizedInit, "duplex");
  return normalizedInit;
}

const workerCompatibleFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, omitUndefinedDuplex(init));

type CloudflareWorkersRuntime = {
  readonly env: Cloudflare.Env;
};

const cloudflareWorkersModuleName = ["cloudflare", "workers"].join(":");

async function importCloudflareWorkers(): Promise<CloudflareWorkersRuntime> {
  return import(/* @vite-ignore */ cloudflareWorkersModuleName);
}

const getServerApiWorkerFetch = createIsomorphicFn()
  .server(async (): Promise<typeof fetch | undefined> => {
    const { env } = await importCloudflareWorkers();

    return (input, init) =>
      env.API_WORKER.fetch(input, omitUndefinedDuplex(init));
  })
  .client(() => undefined);

const runtimeApiFetch: typeof fetch = async (input, init) => {
  const serverApiWorkerFetch = await getServerApiWorkerFetch();
  return (serverApiWorkerFetch ?? workerCompatibleFetch)(input, init);
};

function makeApiClientLive(
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation?: typeof fetch,
) {
  const fetchHttpClientLayer = FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch)(
        fetchImplementation ?? runtimeApiFetch,
      ),
    ),
  );

  return Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, {
      baseUrl: apiBaseUrl,
      transformClient: retryTransientGetRequests,
    }),
  ).pipe(Layer.provide(fetchHttpClientLayer));
}

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

/** TanStack Query options for API health backed by the shared Effect HttpApi contract. */
export function apiHealthQueryOptions(
  options: Readonly<{ apiBaseUrl: ApiBaseUrl; fetch?: typeof fetch }>,
) {
  const effectQuery = createEffectQuery(
    makeApiClientLive(options.apiBaseUrl, options.fetch),
  );

  return effectQuery.queryOptions({
    queryKey: ["api", "health", options.apiBaseUrl.href] as const,
    refetchInterval: apiHealthRefetchInterval,
    queryFn: () =>
      loadApiHealthStatus().pipe(
        Effect.catchCause((cause) =>
          logApiHealthFailure(cause).pipe(
            Effect.as(unhealthyApiHealthStatus),
          ),
        ),
      ),
  });
}
