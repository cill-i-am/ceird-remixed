import { Api } from "@ceird/api-contract";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient";
import * as Schedule from "effect/Schedule";
import { runtimeApiFetch } from "./api-runtime-fetch";
import type { ApiBaseUrl } from "./public-config-schema";

/** Effect service for the shared typed API client. */
export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof Api>
>()("ceird/ApiClient") {}

const transientGetRequestRetryCount = 2;
const transientGetRequestRetrySchedule = Schedule.exponential(
  "100 millis",
  2,
).pipe(Schedule.jittered);

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

const rejectTransientHttpResponse = (
  response: HttpClientResponse.HttpClientResponse,
) =>
  isTransientHttpResponse(response)
    ? HttpClientResponse.filterStatus(response, () => false)
    : Effect.succeed(response);

const retryTransientGetRequests = (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (effect, request) =>
    request.method === "GET"
      ? effect.pipe(
          Effect.flatMap(rejectTransientHttpResponse),
          Effect.retry({
            schedule: transientGetRequestRetrySchedule,
            times: transientGetRequestRetryCount,
            while: isTransientHttpClientError,
          }),
        )
      : effect,
  );

/** Build the live Effect layer for the typed API client. */
export function makeApiClientLive(
  apiBaseUrl: ApiBaseUrl,
  fetchImplementation: typeof fetch = runtimeApiFetch,
) {
  const fetchHttpClientLayer = FetchHttpClient.layer.pipe(
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
