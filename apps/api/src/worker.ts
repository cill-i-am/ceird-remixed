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
import { runAuthBackgroundTask } from "./background-tasks.ts";
import { makeCorsPolicy } from "./cors.ts";
import { closeApiDb, makeApiDb, makeDbHealthLiveFromDb } from "./db.ts";
import { ApiHyperdrive } from "./db-infra.ts";
import { makeHttpApiFetch } from "./http.ts";
import { makeWorkerFetch } from "./worker-runtime.ts";

export class ApiWorker extends Cloudflare.Worker<
  ApiWorker,
  Cloudflare.WorkerShape
>()("Api") {}

const ApiWorkerLive = ApiWorker.make(
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
    const apiHyperdrive = yield* Cloudflare.Hyperdrive.bind(ApiHyperdrive);
    const stack = yield* Alchemy.Stack;
    const stage = stack.stage;
    const stageAuthConfig = makeStageAuthConfig(stage);
    const allowLocalConfig = isLocalStage(stage);
    const authSecretConfig = Config.schema(
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
      ...parseOriginList(Option.getOrUndefined(configuredTrustedOrigins), {
        allowLocalHttp: allowLocalConfig,
      }),
    ]);
    const allowedHosts = unique(
      [
        stageAuthConfig.apiHost,
        ...parseHostList(Option.getOrUndefined(configuredAllowedHosts), {
          allowLocalHosts: allowLocalConfig,
        }),
      ].map((host) => host.toLowerCase()),
    );
    const corsPolicy = makeCorsPolicy({
      credentialedOrigins: trustedOrigins,
    });

    return {
      fetch: Effect.gen(function* () {
        const executionContext = yield* WorkerExecutionContext;
        const runtimeContext = yield* Alchemy.RuntimeContext;
        const workerFetch = makeWorkerFetch({
          config: {
            corsPolicy,
          },
          deps: {
            makeAuthConfig: () =>
              Effect.runPromise(
                Effect.gen(function* () {
                  return {
                    secret: yield* authSecretConfig,
                    trustedOrigins,
                    allowedHosts,
                    protocol: "https" as const,
                    useSecureCookies: true,
                  };
                }),
              ),
            makeDb: () =>
              makeApiDb(
                apiHyperdrive.connectionString.pipe(
                  Effect.provideService(
                    Alchemy.RuntimeContext,
                    runtimeContext,
                  ),
                ),
              ),
            closeDb: closeApiDb,
            createAuth: (db, config) => createAuth(db.authDb, config),
            makeHttpApiFetch: ({ auth, db, corsPolicy }) =>
              makeHttpApiFetch({
                auth,
                dbHealthLive: makeDbHealthLiveFromDb(db),
                corsPolicy,
              }),
            backgroundTaskHandler: runAuthBackgroundTask,
          },
        });

        return yield* HttpEffect.fromWebHandler((request) => {
          return workerFetch(request, {
            waitUntil: (promise) => executionContext.waitUntil(promise),
          });
        });
      }),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
);

export default ApiWorker.pipe(Effect.provide(ApiWorkerLive));

function unique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}

function isLocalStage(stage: string) {
  return stage === "dev" || stage === "test" || stage.startsWith("dev_");
}
