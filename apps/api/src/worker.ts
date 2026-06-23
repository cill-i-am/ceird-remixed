import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import { parseHostList, parseOriginList } from "./auth-config.ts";
import { createAuth } from "./auth.ts";
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
    const authSecret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const configuredTrustedOrigins = yield* Config.string(
      "CEIRD_AUTH_TRUSTED_ORIGINS",
    ).pipe(Config.option);
    const configuredAllowedHosts = yield* Config.string(
      "CEIRD_AUTH_ALLOWED_HOSTS",
    ).pipe(Config.option);
    const trustedOrigins = parseOriginList(
      Option.getOrUndefined(configuredTrustedOrigins),
    );
    const allowedHosts = parseHostList(
      Option.getOrUndefined(configuredAllowedHosts),
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
        const api = yield* runtime;

        return yield* HttpEffect.fromWebHandler(api.fetch);
      }),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
) {}
