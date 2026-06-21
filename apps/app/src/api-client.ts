import { Api, type HealthResponse } from "@ceird/api-contract";
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
import { apiBaseUrl } from "./public-config";

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

const transientGetRequestRetryCount = 2;
const transientGetRequestRetrySchedule = Schedule.exponential(
  "100 millis",
  2,
).pipe(Schedule.jittered);
const apiHealthRefetchInterval = 30 * 1000;

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

function makeApiClientLive(fetchImplementation?: typeof fetch) {
  const fetchHttpClientLayer =
    fetchImplementation === undefined
      ? FetchHttpClient.layer
      : FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.Fetch)(fetchImplementation),
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

/** Create TanStack Query options for API health backed by the shared Effect HttpApi contract. */
export function makeApiHealthQueryOptions(
  options: Readonly<{ fetch?: typeof fetch }> = {},
) {
  const effectQuery = createEffectQuery(makeApiClientLive(options.fetch));

  return effectQuery.queryOptions({
    queryKey: ["api", "health"] as const,
    refetchInterval: apiHealthRefetchInterval,
    queryFn: () =>
      loadApiHealthStatus().pipe(
        Effect.match({
          onFailure: () => unhealthyApiHealthStatus,
          onSuccess: (status) => status,
        }),
      ),
  });
}

/** TanStack Query options for API health using the runtime fetch implementation. */
export const apiHealthQueryOptions = makeApiHealthQueryOptions();
