import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, test } from "vitest";
import { makeRuntimeApiFetchServerFromRuntime } from "./api-runtime-fetch.server-runtime";
import {
  loadPublicConfigFromEnv,
  loadPublicConfigFromRuntime,
} from "./public-config.server";
import { parsePublicConfig } from "./public-config-schema";

const ApiWorkerEchoSchema = Schema.Struct({
  headers: Schema.Record(Schema.String, Schema.String),
  method: Schema.String,
  url: Schema.String,
});

const parseApiWorkerEcho = Schema.decodeUnknownSync(ApiWorkerEchoSchema);

describe("server runtime bindings", () => {
  test("loads public config from the Cloudflare runtime env binding", async () => {
    const publicConfig = parsePublicConfig(
      await Effect.runPromise(loadPublicConfigFromRuntime),
    );

    expect(publicConfig.apiBaseUrl.href).toBe("https://api.test/");
    expect(loadPublicConfigFromEnv(env)).toEqual({
      apiBaseUrl: "https://api.test/",
    });
  });

  test("uses the API_WORKER service binding without forwarding disallowed incoming headers", async () => {
    const apiFetch = makeRuntimeApiFetchServerFromRuntime({
      getApiWorker: () => env.API_WORKER,
      getIncomingHeaders: () =>
        new Headers({
          authorization: "Bearer user-token",
          cookie: "better-auth.session_token=app-host-cookie; theme=dark",
          traceparent: "incoming-traceparent",
          "x-app-internal": "should-not-forward",
          "x-forwarded-for": "203.0.113.10",
        }),
    });

    const response = await apiFetch("https://api.test/health", {
      headers: {
        accept: "application/json",
      },
    });
    const echo = parseApiWorkerEcho(await response.json());

    expect(echo.url).toBe("https://api.test/health");
    expect(echo.method).toBe("GET");
    expect(echo.headers.accept).toBe("application/json");
    expect(echo.headers.authorization).toBe("Bearer user-token");
    expect(echo.headers.traceparent).toBe("incoming-traceparent");
    expect(echo.headers.cookie).toBeUndefined();
    expect(echo.headers["x-app-internal"]).toBeUndefined();
    expect(echo.headers["x-forwarded-for"]).toBeUndefined();
  });
});
