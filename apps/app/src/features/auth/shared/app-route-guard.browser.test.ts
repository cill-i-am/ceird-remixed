import { isRedirect } from "@tanstack/react-router";
import { MeResponse } from "@ceird/api-contract";
import * as Schema from "effect/Schema";
import { describe, expect, test } from "vitest";
import { parseApiBaseUrl } from "../../../public-config-schema";
import type { Session } from "../../../queries/auth-queries";
import { makeAuthenticatedAppRouteContext } from "./app-route-guard";

const testApiBaseUrl = parseApiBaseUrl("https://api.route-guard.test");
const authenticatedSession = {
  _tag: "Authenticated",
  user: Schema.decodeUnknownSync(MeResponse)({
    id: "user_123",
    email: "ada@example.com",
    emailVerified: true,
    name: "Ada Lovelace",
  }),
} satisfies Session;

describe("makeAuthenticatedAppRouteContext", () => {
  test("allows direct authenticated app route loads", () => {
    expect(
      makeAuthenticatedAppRouteContext({
        apiBaseUrl: testApiBaseUrl,
        session: authenticatedSession,
      }),
    ).toEqual({
      apiBaseUrl: "https://api.route-guard.test/",
      authBaseUrl: "https://api.route-guard.test/",
    });
  });

  test("redirects anonymous app route loads to sign in", () => {
    try {
      makeAuthenticatedAppRouteContext({
        apiBaseUrl: testApiBaseUrl,
        session: { _tag: "Anonymous" },
      });
      throw new Error("Expected anonymous app route load to redirect.");
    } catch (cause) {
      expect(isRedirect(cause)).toBe(true);

      if (isRedirect(cause)) {
        expect(cause.options.to).toBe("/sign-in");
        expect(cause.options.replace).toBe(true);
      }
    }
  });
});
