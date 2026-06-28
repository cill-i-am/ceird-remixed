import { describe, expect, test } from "vitest";
import {
  forwardedApiHeaderNames,
  makeApiWorkerFetch,
  withForwardedApiHeaders,
} from "./api-runtime-fetch-core";

describe("makeApiWorkerFetch", () => {
  test("calls the API worker binding with the original request", async () => {
    const calls: Array<Request> = [];
    const apiFetch = makeApiWorkerFetch({
      fetch: async (input, init) => {
        calls.push(new Request(input, init));
        return new Response("ok");
      },
    });

    await apiFetch("https://api.test/health", {
      headers: {
        accept: "application/json",
      },
      method: "GET",
    });

    const request = expectSingleRequest(calls);
    expect(request.url).toBe("https://api.test/health");
    expect(request.method).toBe("GET");
    expect(request.headers.get("accept")).toBe("application/json");
  });

  test("forwards request auth and trace headers when the API request does not set them", async () => {
    const calls: Array<Request> = [];
    const apiFetch = makeApiWorkerFetch(
      {
        fetch: async (input, init) => {
          calls.push(new Request(input, init));
          return new Response("ok");
        },
      },
      {
        incomingHeaders: new Headers({
          authorization: "Bearer user-token",
          b3: "incoming-b3",
          traceparent: "incoming-traceparent",
          "x-b3-traceid": "incoming-trace-id",
        }),
      },
    );

    await apiFetch("https://api.test/health");

    const request = expectSingleRequest(calls);
    expect(request.headers.get("authorization")).toBe("Bearer user-token");
    expect(request.headers.get("b3")).toBe("incoming-b3");
    expect(request.headers.get("traceparent")).toBe("incoming-traceparent");
    expect(request.headers.get("x-b3-traceid")).toBe("incoming-trace-id");
  });

  test("does not list cookies as broadly forwarded headers", () => {
    expect(forwardedApiHeaderNames).not.toContain("cookie");
  });
});

describe("withForwardedApiHeaders", () => {
  test("preserves API request headers over forwarded request headers", () => {
    const headers = withForwardedApiHeaders(
      new Headers({
        authorization: "Bearer api-token",
        traceparent: "api-traceparent",
      }),
      new Headers({
        authorization: "Bearer user-token",
        b3: "incoming-b3",
        traceparent: "incoming-traceparent",
      }),
    );

    expect(headers.get("authorization")).toBe("Bearer api-token");
    expect(headers.get("b3")).toBe("incoming-b3");
    expect(headers.get("traceparent")).toBe("api-traceparent");
  });

  test("forwards only Better Auth session cookies from app-host SSR requests", () => {
    const headers = withForwardedApiHeaders(
      new Headers(),
      new Headers({
        cookie:
          "theme=dark; better-auth.session_token=app-host-cookie; other=value",
      }),
    );

    expect(headers.get("cookie")).toBe(
      "better-auth.session_token=app-host-cookie",
    );
  });

  test("recognizes prefixed Better Auth session cookies", () => {
    const headers = withForwardedApiHeaders(
      new Headers(),
      new Headers({
        cookie: "__Secure-better-auth.session_token=secure-cookie; theme=dark",
      }),
    );

    expect(headers.get("cookie")).toBe(
      "__Secure-better-auth.session_token=secure-cookie",
    );
  });

  test("does not forward unrelated cookies with Better Auth-like suffixes", () => {
    const headers = withForwardedApiHeaders(
      new Headers(),
      new Headers({
        cookie: "tracking-better-auth.session_token=tracking-cookie",
      }),
    );

    expect(headers.has("cookie")).toBe(false);
  });

  test("does not replace explicit API request cookies", () => {
    const headers = withForwardedApiHeaders(
      new Headers({
        cookie: "better-auth.session_token=api-request-cookie",
      }),
      new Headers({
        cookie: "better-auth.session_token=app-host-cookie",
      }),
    );

    expect(headers.get("cookie")).toBe(
      "better-auth.session_token=api-request-cookie",
    );
  });
});

function expectSingleRequest(calls: ReadonlyArray<Request>) {
  expect(calls).toHaveLength(1);

  const request = calls.at(0);
  if (request === undefined) {
    throw new Error("Expected exactly one API worker fetch call.");
  }

  return request;
}
