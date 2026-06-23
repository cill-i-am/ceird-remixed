import { describe, expect, test } from "vitest";
import { runtimeApiFetch } from "./api-runtime-fetch";

describe("runtimeApiFetch", () => {
  test("uses the browser fetch implementation in browser runtime", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<Request> = [];

    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request);

      return new Response("ok");
    };

    try {
      const response = await runtimeApiFetch("https://api.test/health", {
        headers: {
          accept: "application/json",
        },
        method: "GET",
      });

      expect(await response.text()).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls.at(0)?.url).toBe("https://api.test/health");
      expect(calls.at(0)?.headers.get("accept")).toBe("application/json");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
