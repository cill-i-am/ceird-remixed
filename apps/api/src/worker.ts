import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { WorkerExecutionContext } from "alchemy/Cloudflare/Workers";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
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
import { makeCorsPolicy, type CorsPolicy } from "./cors.ts";
import { closeApiDb, makeApiDb, makeDbHealthLiveFromDb } from "./db.ts";
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

    return {
      fetch: Effect.gen(function* () {
        const executionContext = yield* WorkerExecutionContext;
        const connectionString = yield* hyperdrive.connectionString;

        return yield* HttpEffect.fromWebHandler((request) =>
          handleRequestWithScopedRuntime({
            request,
            connectionString,
            authSecret,
            trustedOrigins,
            allowedHosts,
            corsPolicy,
            waitUntil: (promise) => executionContext.waitUntil(promise),
          })
        );
      }),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
) {}

function unique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}

async function handleRequestWithScopedRuntime(options: {
  readonly request: Request;
  readonly connectionString: Redacted.Redacted<string>;
  readonly authSecret: Redacted.Redacted<string>;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly allowedHosts: ReadonlyArray<string>;
  readonly corsPolicy: CorsPolicy;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}) {
  const backgroundTasks: Array<Promise<unknown>> = [];
  const db = makeApiDb(options.connectionString);
  const auth = createAuth(db, {
    secret: options.authSecret,
    trustedOrigins: options.trustedOrigins,
    allowedHosts: options.allowedHosts,
    protocol: "https",
    useSecureCookies: true,
    backgroundTaskHandler: runAuthBackgroundTask,
  });
  const api = makeHttpApiFetch({
    auth,
    dbHealthLive: makeDbHealthLiveFromDb(db),
    corsPolicy: options.corsPolicy,
  });

  try {
    return await runWithBackgroundTaskContext(
      {
        waitUntil: (promise) => {
          backgroundTasks.push(promise);
          options.waitUntil(promise);
        },
      },
      () => api.fetch(options.request),
    );
  } finally {
    const dispose = Promise.allSettled(backgroundTasks).then(async () => {
      await api.dispose();
      await closeApiDb(db);
    });
    options.waitUntil(dispose);
  }
}
