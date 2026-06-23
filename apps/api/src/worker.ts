import * as Cloudflare from "alchemy/Cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import { createAuth } from "./auth.ts";
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
    const stage = yield* Alchemy.Stage;
    const hyperdrive = yield* Cloudflare.Hyperdrive.bind(ApiHyperdrive);
    const authSecret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const authCookieDomainOverride = yield* Config.string(
      "CEIRD_AUTH_COOKIE_DOMAIN",
    ).pipe(Config.option);
    const authCookieDomain = stage === "prod"
      ? Option.some("ceird.app")
      : authCookieDomainOverride;
    const runtime = yield* Effect.cached(
      Effect.gen(function* () {
        const connectionString = yield* hyperdrive.connectionString;
        const db = makeApiDb(connectionString);
        const auth = createAuth(db, {
          secret: authSecret,
          ...(Option.isSome(authCookieDomain)
            ? { cookieDomain: authCookieDomain.value }
            : {}),
        });

        return makeHttpApiFetch({
          auth,
          dbHealthLive: makeDbHealthLiveFromDb(db),
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
