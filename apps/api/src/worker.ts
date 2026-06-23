import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { WorkerExecutionContext } from "alchemy/Cloudflare/Workers";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import {
  BetterAuthSecretSchema,
  makeStageAuthConfig,
  parseHostList,
  parseOriginList,
} from "./auth-config.ts";
import { createAuth } from "./auth.ts";
import {
  runAuthBackgroundTask,
  runWithBackgroundTaskContext,
} from "./background-tasks.ts";
import { makeCorsPolicy } from "./cors.ts";
import { makeApiDb, makeDbHealthLiveFromDb } from "./db.ts";
import { ApiHyperdrive } from "./db-infra.ts";
import { makeHttpApiFetch } from "./http.ts";

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
    const stage = yield* Alchemy.Stage;
    const stageAuthConfig = makeStageAuthConfig(stage);
    const authSecret = yield* Config.schema(
      BetterAuthSecretSchema,
      "BETTER_AUTH_SECRET",
    );
    const configuredTrustedOrigins = yield* Config.string(
      "CEIRD_AUTH_TRUSTED_ORIGINS",
    ).pipe(Config.option);
    const configuredAllowedHosts = yield* Config.string(
      "CEIRD_AUTH_ALLOWED_HOSTS",
    ).pipe(Config.option);
    const trustedOrigins = unique([
      stageAuthConfig.appOrigin,
      ...parseOriginList(Option.getOrUndefined(configuredTrustedOrigins)),
    ]);
    const allowedHosts = unique(
      [
        stageAuthConfig.apiHost,
        ...parseHostList(Option.getOrUndefined(configuredAllowedHosts)),
      ].map((host) => host.toLowerCase()),
    );
    const corsPolicy = makeCorsPolicy({
      credentialedOrigins: trustedOrigins,
    });
    const runtime = yield* Effect.cached(
      Effect.gen(function* () {
        const connectionString = yield* hyperdrive.connectionString;
        const db = makeApiDb(connectionString);
        const auth = createAuth(db, {
          secret: authSecret,
          trustedOrigins,
          allowedHosts,
          protocol: "https",
          useSecureCookies: true,
          backgroundTaskHandler: runAuthBackgroundTask,
        });

        return makeHttpApiFetch({
          auth,
          dbHealthLive: makeDbHealthLiveFromDb(db),
          corsPolicy,
        });
      }),
    );

    return {
      fetch: Effect.gen(function* () {
        const executionContext = yield* WorkerExecutionContext;
        const api = yield* runtime;

        return yield* HttpEffect.fromWebHandler((request) =>
          runWithBackgroundTaskContext(
            { waitUntil: (promise) => executionContext.waitUntil(promise) },
            () => api.fetch(request),
          )
        );
      }),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
) {}

function unique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}
