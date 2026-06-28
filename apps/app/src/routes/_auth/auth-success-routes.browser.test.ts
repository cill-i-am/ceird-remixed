import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { parseApiBaseUrl } from "../../public-config-schema";
import { createSignInSuccessHandler } from "./sign-in";
import { createSignUpSuccessHandler } from "./sign-up";

const testApiBaseUrl = parseApiBaseUrl("https://api.auth-route-success.test");

describe("auth route success callbacks", () => {
  test("sign-in success refreshes the session and navigates into the shell", async () => {
    await expectAuthRouteSuccess(
      createSignInSuccessHandler,
      "refresh",
      "navigate:/dashboard",
    );
  });

  test("sign-up success refreshes the session and navigates into the shell", async () => {
    await expectAuthRouteSuccess(
      createSignUpSuccessHandler,
      "refresh",
      "navigate:/dashboard",
    );
  });
});

async function expectAuthRouteSuccess(
  createSuccessHandler: typeof createSignInSuccessHandler,
  ...expectedEvents: ReadonlyArray<string>
) {
  const events: Array<string> = [];
  const queryClient = new QueryClient();
  const handleSuccess = createSuccessHandler({
    apiBaseUrl: testApiBaseUrl,
    queryClient,
    refreshSession: async (actualQueryClient, actualApiBaseUrl) => {
      expect(actualQueryClient).toBe(queryClient);
      expect(actualApiBaseUrl).toBe(testApiBaseUrl);
      events.push("refresh");
    },
    navigate: (options) => {
      events.push(`navigate:${options.to}`);
    },
  });

  await handleSuccess();

  expect(events).toEqual(expectedEvents);
}
