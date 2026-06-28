import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MeResponse } from "@ceird/api-contract";
import * as Schema from "effect/Schema";
import {
  authQueryKeys,
  refreshAuthSession,
  type Session,
} from "./auth-queries";
import { parseApiBaseUrl } from "../public-config-schema";

type FetchCall = {
  readonly method: string;
  readonly url: string;
};

const testApiBaseUrl = parseApiBaseUrl("https://api.session-refresh.test");
const testApiMeUrl = new URL("/me", testApiBaseUrl).href;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshAuthSession", () => {
  test("invalidates and refetches the session query", async () => {
    const queryClient = makeQueryClient();
    const previousSession = {
      _tag: "Authenticated",
      user: Schema.decodeUnknownSync(MeResponse)({
        id: "user_old",
        email: "old@example.com",
        emailVerified: true,
        name: "Old User",
      }),
    } satisfies Session;
    const refreshedUser = {
      id: "user_new",
      email: "new@example.com",
      emailVerified: true,
      name: "New User",
    };
    const { calls, fetch } = makeFetch(() => jsonResponse(refreshedUser));
    vi.stubGlobal("fetch", fetch);

    queryClient.setQueryData(
      authQueryKeys.session(testApiBaseUrl),
      previousSession,
    );

    const session = await refreshAuthSession(queryClient, testApiBaseUrl);

    expect(session).toEqual({
      _tag: "Authenticated",
      user: refreshedUser,
    });
    expect(
      queryClient.getQueryData(authQueryKeys.session(testApiBaseUrl)),
    ).toEqual(session);
    expect(calls).toEqual([{ method: "GET", url: testApiMeUrl }]);
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

function makeFetch(respond: () => Response | Promise<Response>) {
  const calls: Array<FetchCall> = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      method: request.method,
      url: request.url,
    });

    return respond();
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
