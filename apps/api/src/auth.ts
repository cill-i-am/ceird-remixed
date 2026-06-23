import { account, session, user, verification } from "@ceird/db/schema";
import {
  MeResponse,
  UserIdSchema,
  type UserId,
} from "@ceird/api-contract";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  betterAuthAllowedHosts,
  betterAuthTrustedOrigins,
} from "./cors.ts";

export class Principal extends Schema.Class<Principal>("Principal")({
  id: UserIdSchema,
  email: Schema.String,
  name: Schema.String,
}) {
  toView() {
    return MeResponse.make({
      id: this.id,
      email: this.email,
      name: this.name,
    });
  }
}

export class Unauthenticated extends Schema.TaggedErrorClass<Unauthenticated>()(
  "Unauthenticated",
  {
    reason: Schema.Literal("missing-session"),
  },
) {}

export class AuthSessionLookupFailed extends Schema.TaggedErrorClass<AuthSessionLookupFailed>()(
  "AuthSessionLookupFailed",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class AuthSessionParseFailed extends Schema.TaggedErrorClass<AuthSessionParseFailed>()(
  "AuthSessionParseFailed",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type AuthError =
  | Unauthenticated
  | AuthSessionLookupFailed
  | AuthSessionParseFailed;

export type AuthConfig = {
  readonly secret: Redacted.Redacted<string>;
  readonly cookieDomain?: string;
};

export class Auth extends Context.Service<
  Auth,
  {
    readonly requirePrincipal: (
      headers: Headers,
    ) => Effect.Effect<Principal, AuthError>;
  }
>()("ceird/Auth") {}

const BetterAuthSessionSchema = Schema.Struct({
  user: Principal,
});

const decodeSession = Schema.decodeUnknownEffect(BetterAuthSessionSchema);

export function createAuth(database: Parameters<typeof drizzleAdapter>[0], config: AuthConfig) {
  const baseProtocol = config.cookieDomain === undefined ? "auto" : "https";

  return betterAuth({
    appName: "Ceird",
    basePath: "/api/auth",
    baseURL: {
      allowedHosts: [...betterAuthAllowedHosts],
      protocol: baseProtocol,
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [...betterAuthTrustedOrigins],
    secret: Redacted.value(config.secret),
    advanced: {
      crossSubDomainCookies: {
        enabled: config.cookieDomain !== undefined,
        ...(config.cookieDomain === undefined
          ? {}
          : { domain: config.cookieDomain }),
      },
    },
    logger: {
      disabled: true,
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;

export const makeAuthLive = (auth: AuthInstance) =>
  Layer.succeed(Auth)({
    requirePrincipal: Effect.fn("Auth.requirePrincipal")(function* (headers) {
      const sessionResult = yield* Effect.tryPromise({
        try: () => auth.api.getSession({ headers }),
        catch: (cause) =>
          AuthSessionLookupFailed.make({
            message: "Unable to look up Better Auth session.",
            cause,
          }),
      });

      if (sessionResult === null) {
        return yield* Effect.fail(
          Unauthenticated.make({ reason: "missing-session" }),
        );
      }

      const parsed = yield* decodeSession(sessionResult).pipe(
        Effect.mapError((cause) =>
          AuthSessionParseFailed.make({
            message: "Better Auth session did not match the API principal shape.",
            cause,
          }),
        ),
      );

      return parsed.user;
    }),
  });

export function principalUserId(principal: Principal): UserId {
  return principal.id;
}
