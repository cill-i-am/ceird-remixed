import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { Api, HealthResponse, HelloResponse } from "@ceird/api-contract";

const helloResponse = HelloResponse.make({
  ok: true,
  message: "Hello from an Effect HttpApi on Cloudflare Workers.",
  stage: "dummy",
});

const productionApiHostname = "remixed-api.ceird.app";

const apiWorkerProps = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage;

  return {
    main: import.meta.filename,
    url: true,
    ...(stage === "prod" ? { domain: productionApiHostname } : {}),
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
    },
  };
});

const handlers = HttpApiBuilder.group(Api, "Meta", (group) =>
  group
    .handle("health", () =>
      Effect.succeed(
        HealthResponse.make({
          ok: true,
          service: "ceird-api",
          status: "healthy",
        }),
      ),
    )
    .handle("root", () => Effect.succeed(helloResponse))
    .handle("hello", () => Effect.succeed(helloResponse)),
);

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  apiWorkerProps,
  Effect.gen(function* () {
    return {
      fetch: HttpApiBuilder.layer(Api).pipe(
        Layer.provide(handlers),
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
  }),
) {}
