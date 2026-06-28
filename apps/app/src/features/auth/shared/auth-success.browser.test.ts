import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { parseApiBaseUrl } from "../../../public-config-schema";
import { handleAuthMutationSuccess } from "./auth-success";

const testApiBaseUrl = parseApiBaseUrl("https://api.auth-success.test");

describe("handleAuthMutationSuccess", () => {
  test("refreshes the session before navigating to the authenticated shell", async () => {
    const events: Array<string> = [];
    const queryClient = new QueryClient();

    await handleAuthMutationSuccess({
      apiBaseUrl: testApiBaseUrl,
      queryClient,
      to: "/dashboard",
      refreshSession: async (actualQueryClient, actualApiBaseUrl) => {
        expect(actualQueryClient).toBe(queryClient);
        expect(actualApiBaseUrl).toBe(testApiBaseUrl);
        events.push("refresh");
      },
      navigate: (options) => {
        events.push(`navigate:${options.to}`);
      },
    });

    expect(events).toEqual(["refresh", "navigate:/dashboard"]);
  });

  test("still navigates when the session refresh fails after auth succeeds", async () => {
    const events: Array<string> = [];

    await handleAuthMutationSuccess({
      apiBaseUrl: testApiBaseUrl,
      queryClient: new QueryClient(),
      to: "/dashboard",
      refreshSession: async () => {
        events.push("refresh");
        throw new Error("Session refresh failed.");
      },
      navigate: (options) => {
        events.push(`navigate:${options.to}`);
      },
    });

    expect(events).toEqual(["refresh", "navigate:/dashboard"]);
  });

  test("can navigate to the anonymous auth entry after sign-out", async () => {
    const events: Array<string> = [];

    await handleAuthMutationSuccess({
      apiBaseUrl: testApiBaseUrl,
      queryClient: new QueryClient(),
      to: "/sign-in",
      refreshSession: async () => {
        events.push("refresh");
      },
      navigate: (options) => {
        events.push(`navigate:${options.to}`);
      },
    });

    expect(events).toEqual(["refresh", "navigate:/sign-in"]);
  });
});
