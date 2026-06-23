import * as Cloudflare from "alchemy/Cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
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
    const stage = yield* Alchemy.Stage;
    const hyperdrive = yield* Cloudflare.Hyperdrive.bind(ApiHyperdrive);
    const authSecret = yield* Config.redacted("BETTER_AUTH_SECRET");
    const authCookieDomainOverride = yield* Config.string(
      "CEIRD_AUTH_COOKIE_DOMAIN",
    ).pipe(Config.option);
    const configuredTrustedOrigins = yield* Config.string(
      "CEIRD_AUTH_TRUSTED_ORIGINS",
    ).pipe(Config.option);
    const configuredAllowedHosts = yield* Config.string(
      "CEIRD_AUTH_ALLOWED_HOSTS",
    ).pipe(Config.option);
    const authCookieDomain = stage === "prod"
      ? Option.some("ceird.app")
      : authCookieDomainOverride;
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
          ...(Option.isSome(authCookieDomain)
            ? { cookieDomain: authCookieDomain.value }
            : {}),
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

function parseOriginList(input: string | undefined): ReadonlyArray<string> {
  return splitConfigList(input).map((origin) => {
    const parsed = new URL(origin);

    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      throw new Error(
        `CEIRD_AUTH_TRUSTED_ORIGINS must contain origins only: ${origin}`,
      );
    }

    return parsed.origin;
  });
}

function parseHostList(input: string | undefined): ReadonlyArray<string> {
  return splitConfigList(input).map((host) => {
    if (host.includes("://")) {
      return new URL(host).host;
    }

    if (host.includes("/")) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS must contain hostnames only: ${host}`,
      );
    }

    return host.toLowerCase();
  });
}

function splitConfigList(input: string | undefined): ReadonlyArray<string> {
  if (input === undefined) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
