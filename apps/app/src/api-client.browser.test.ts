import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import {
  apiHealthRefetchInterval,
  apiHealthQueryOptions,
} from "./api-client";
import { parseApiBaseUrl } from "./public-config-schema";

type FetchCall = {
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly url: string;
};

const healthyResponseBody = {
  ok: true,
  service: "ceird-api",
  status: "healthy",
};
const testApiBaseUrl = parseApiBaseUrl("http://api.test");

describe("apiHealthQueryOptions", () => {
  test("polls API health every thirty seconds", () => {
    expect(
      apiHealthQueryOptions({
        apiBaseUrl: testApiBaseUrl,
      }).refetchInterval,
    ).toBe(apiHealthRefetchInterval);
  });

  test("retries transient GET responses before returning a healthy result", async () => {
    const { calls, fetch } = makeFetch((callIndex) =>
      callIndex === 0
        ? new Response(undefined, { status: 503 })
        : jsonResponse(healthyResponseBody),
    );
    const queryClient = makeQueryClient();
    const queryOptions = apiHealthQueryOptions({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const health = await queryClient.ensureQueryData(queryOptions);

    expect(health).toEqual({
      _tag: "Healthy",
      service: "ceird-api",
      status: "healthy",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);

    const firstCall = calls.at(0);
    if (firstCall === undefined) {
      throw new Error("Expected the health query to issue at least one request.");
    }

    expect(firstCall.headers).toHaveProperty("b3");
    expect(firstCall.headers).toHaveProperty("traceparent");
  });

  test("returns an unhealthy result when the health request cannot recover", async () => {
    const { calls, fetch } = makeFetch(() => {
      throw new TypeError("Network unavailable");
    });
    const queryClient = makeQueryClient();
    const queryOptions = apiHealthQueryOptions({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const health = await queryClient.ensureQueryData(queryOptions);

    expect(health).toEqual({
      _tag: "Unhealthy",
      message: "API health check failed.",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET"]);
  });
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function makeFetch(
  respond: (callIndex: number, request: Request) => Response | Promise<Response>,
) {
  const calls: Array<FetchCall> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const callIndex = calls.length;

    calls.push({
      headers: Object.fromEntries(request.headers.entries()),
      method: request.method,
      url: request.url,
    });

    return respond(callIndex, request);
  };

  return { calls, fetch: fetchImplementation };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}
