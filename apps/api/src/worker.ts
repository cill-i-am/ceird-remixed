import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { Api, HealthResponse, HelloResponse } from "@ceird/api-contract";
import { DbHealth, makeDbHealthLive } from "./db-health.ts";
import { ApiHyperdrive } from "./db-infra.ts";

const helloResponse = HelloResponse.make({
  ok: true,
  message: "Hello from an Effect HttpApi on Cloudflare Workers.",
  stage: "dummy",
});

const handlers = HttpApiBuilder.group(Api, "Meta", (group) =>
  Effect.gen(function* () {
    const dbHealth = yield* DbHealth;

    return group
      .handle("health", () =>
        Effect.succeed(
          HealthResponse.make({
            ok: true,
            service: "ceird-api",
            status: "healthy",
          }),
        ),
      )
      .handle("dbHealth", () =>
        dbHealth.check().pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              "Database health check failed.",
              "operation:",
              error.operation,
            ),
          ),
          Effect.catchTag(
            "DbHealthCheckFailed",
            () => Effect.fail(new HttpApiError.ServiceUnavailable({})),
          ),
        ),
      )
      .handle("root", () => Effect.succeed(helloResponse))
      .handle("hello", () => Effect.succeed(helloResponse));
  }),
);

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.filename,
    url: true,
    compatibility: {
      flags: ["nodejs_compat"],
    },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
    },
  },
  Effect.gen(function* () {
    const hyperdrive = yield* Cloudflare.Hyperdrive.bind(ApiHyperdrive);
    const dbHealthLive = makeDbHealthLive(hyperdrive);

    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide(handlers),
        Layer.provide(dbHealthLive),
        Layer.provide([HttpPlatform.layer, Etag.layer]),
        Layer.provide(
          HttpRouter.cors({
            allowedHeaders: [
              "Accept",
              "Authorization",
              "Content-Type",
              "b3",
              "traceparent",
              "x-b3-sampled",
              "x-b3-spanid",
              "x-b3-traceid",
            ],
            allowedMethods: ["GET", "OPTIONS"],
            allowedOrigins: ["*"],
          }),
        ),
        HttpRouter.toHttpEffect,
      ),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
) {}
