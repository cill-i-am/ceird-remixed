import { afterEach, describe, expect, test, vi } from "vitest";
import { getAuthClient } from "./auth-client";
import { deriveAuthBaseUrl, parseApiBaseUrl } from "./public-config-schema";

type FetchCall = {
  readonly credentials: RequestCredentials;
  readonly method: string;
  readonly url: string;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app Better Auth client", () => {
  test("caches clients by auth base URL", () => {
    const authBaseUrl = deriveAuthBaseUrl(
      parseApiBaseUrl("https://api.cache.test"),
    );
    const otherAuthBaseUrl = deriveAuthBaseUrl(
      parseApiBaseUrl("https://other-api.cache.test"),
    );

    expect(getAuthClient(authBaseUrl)).toBe(getAuthClient(authBaseUrl));
    expect(getAuthClient(authBaseUrl)).not.toBe(
      getAuthClient(otherAuthBaseUrl),
    );
  });

  test("uses the runtime Better Auth URL with included credentials", async () => {
    const { calls, fetch } = makeFetch();
    vi.stubGlobal("fetch", fetch);
    const authBaseUrl = deriveAuthBaseUrl(
      parseApiBaseUrl("https://api.direct-client.test"),
    );

    await getAuthClient(authBaseUrl).signIn.email({
      email: "ada@example.com",
      password: "correct horse battery staple",
    });

    expect(calls).toEqual([
      {
        credentials: "include",
        method: "POST",
        url: "https://api.direct-client.test/api/auth/sign-in/email",
      },
    ]);
  });
});

function makeFetch() {
  const calls: Array<FetchCall> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      credentials: request.credentials,
      method: request.method,
      url: request.url,
    });

    return jsonResponse({});
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
