import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { apiQueries } from "./api-queries";
import { apiHealthRefetchInterval } from "./queries/meta-queries";
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
const meResponseBody = {
  id: "user_123",
  email: "ada@example.com",
  emailVerified: true,
  name: "Ada Lovelace",
};
const testApiBaseUrl = parseApiBaseUrl("https://api.test");
const testApiHealthUrl = new URL("/health", testApiBaseUrl).href;
const testApiMeUrl = new URL("/me", testApiBaseUrl).href;

describe("apiQueries.auth.session", () => {
  test("uses the API auth session query key", () => {
    expect(
      apiQueries.auth.session({
        apiBaseUrl: testApiBaseUrl,
      }).queryKey,
    ).toEqual(["api", "auth", "session", testApiBaseUrl.href]);
  });

  test("returns an authenticated session from the API principal", async () => {
    const { calls, fetch } = makeFetch(() => jsonResponse(meResponseBody));
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.auth.session({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const session = await queryClient.ensureQueryData(queryOptions);

    expect(session).toEqual({
      _tag: "Authenticated",
      user: meResponseBody,
    });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
    expect(calls.map((call) => call.url)).toEqual([testApiMeUrl]);
  });

  test("returns an anonymous session when the API rejects the session", async () => {
    const { calls, fetch } = makeFetch(() =>
      new Response(undefined, { status: 401 }),
    );
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.auth.session({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const session = await queryClient.ensureQueryData(queryOptions);

    expect(session).toEqual({
      _tag: "Anonymous",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
    expect(calls.map((call) => call.url)).toEqual([testApiMeUrl]);
  });

  test("does not retry the session query after the API client retry budget fails", () => {
    expect(
      apiQueries.auth.session({
        apiBaseUrl: testApiBaseUrl,
      }).retry,
    ).toBe(false);
  });

  test("rejects when the API session request cannot recover", async () => {
    const { calls, fetch } = makeFetch(() =>
      new Response(undefined, { status: 500 }),
    );
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.auth.session({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    await expect(queryClient.ensureQueryData(queryOptions)).rejects.toThrow();
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET"]);
    expect(calls.map((call) => call.url)).toEqual([
      testApiMeUrl,
      testApiMeUrl,
      testApiMeUrl,
    ]);
  });

  test("rejects when the API session response does not match the contract", async () => {
    const { calls, fetch } = makeFetch(() =>
      jsonResponse({
        ...meResponseBody,
        emailVerified: "yes",
      }),
    );
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.auth.session({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    await expect(queryClient.ensureQueryData(queryOptions)).rejects.toThrow();
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
    expect(calls.map((call) => call.url)).toEqual([testApiMeUrl]);
  });

  test("rejects when the API session transport cannot recover", async () => {
    const { calls, fetch } = makeFetch(() => {
      throw new TypeError("Network unavailable");
    });
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.auth.session({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    await expect(queryClient.ensureQueryData(queryOptions)).rejects.toThrow();
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET"]);
    expect(calls.map((call) => call.url)).toEqual([
      testApiMeUrl,
      testApiMeUrl,
      testApiMeUrl,
    ]);
  });
});

describe("apiQueries.meta.health", () => {
  test("uses the API metadata health query key", () => {
    expect(
      apiQueries.meta.health({
        apiBaseUrl: testApiBaseUrl,
      }).queryKey,
    ).toEqual(["api", "meta", "health", testApiBaseUrl.href]);
  });

  test("polls API health every thirty seconds", () => {
    expect(
      apiQueries.meta.health({
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
    const queryOptions = apiQueries.meta.health({
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
    expect(calls.map((call) => call.url)).toEqual([
      testApiHealthUrl,
      testApiHealthUrl,
    ]);

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
    const queryOptions = apiQueries.meta.health({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const health = await queryClient.ensureQueryData(queryOptions);

    expect(health).toEqual({
      _tag: "Unhealthy",
      message: "API health check failed.",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET"]);
    expect(calls.map((call) => call.url)).toEqual([
      testApiHealthUrl,
      testApiHealthUrl,
      testApiHealthUrl,
    ]);
  });

  test("uses one retry budget across transient responses and transport failures", async () => {
    const { calls, fetch } = makeFetch((callIndex) => {
      if (callIndex === 1) {
        throw new TypeError("Network unavailable");
      }

      return new Response(undefined, { status: 503 });
    });
    const queryClient = makeQueryClient();
    const queryOptions = apiQueries.meta.health({
      apiBaseUrl: testApiBaseUrl,
      fetch,
    });

    const health = await queryClient.ensureQueryData(queryOptions);

    expect(health).toEqual({
      _tag: "Unhealthy",
      message: "API health check failed.",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "GET"]);
    expect(calls.map((call) => call.url)).toEqual([
      testApiHealthUrl,
      testApiHealthUrl,
      testApiHealthUrl,
    ]);
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
