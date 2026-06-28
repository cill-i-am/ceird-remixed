import {
  account,
  rateLimit,
  session,
  user,
  verification,
} from "@ceird/db/schema";
import {
  MeResponse,
  UserIdSchema,
  type UserId,
} from "@ceird/api-contract";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { AuthCookieDomain } from "./auth-config.ts";

const smokeTestUserEmailPrefix = "smoke+";
const smokeTestUserEmailDomain = "@example.com";
const smokeTestUserName = "Smoke Test";
const betterAuthSessionCookieNames = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

export class Principal extends Schema.Class<Principal>("Principal")({
  id: UserIdSchema,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  name: Schema.String,
}) {
  toView() {
    return MeResponse.make({
      id: this.id,
      email: this.email,
      emailVerified: this.emailVerified,
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
  readonly allowedHosts: ReadonlyArray<string>;
  readonly crossSubDomainCookieDomain?: AuthCookieDomain;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly protocol: "http" | "https";
  readonly useSecureCookies: boolean;
  readonly backgroundTaskHandler?: (promise: Promise<unknown>) => void;
};

type AuthSessionLookupOptions = {
  readonly headers: Headers;
  readonly query?: {
    readonly disableRefresh?: boolean;
  };
};

type AuthSessionReader = {
  readonly api: {
    readonly getSession: (
      options: AuthSessionLookupOptions,
    ) => Promise<unknown>;
  };
};

export type BetterAuthHandler = {
  readonly handler: (request: Request) => Promise<Response>;
};

export class AuthHandlerFailed extends Schema.TaggedErrorClass<AuthHandlerFailed>()(
  "AuthHandlerFailed",
  {
    cause: Schema.Defect(),
  },
) {}

export class Auth extends Context.Service<
  Auth,
  {
    readonly handleAuthRequest: (
      request: Request,
    ) => Effect.Effect<Response, AuthHandlerFailed>;
    readonly requirePrincipal: (
      headers: Headers,
    ) => Effect.Effect<Principal, AuthError>;
  }
>()("ceird/Auth") {}

const BetterAuthSessionSchema = Schema.Struct({
  user: Principal,
});

const decodeSession = Schema.decodeUnknownEffect(BetterAuthSessionSchema);

export function createAuth(
  database: Parameters<typeof drizzleAdapter>[0],
  config: AuthConfig,
) {
  return betterAuth({
    appName: "Ceird",
    basePath: "/api/auth",
    baseURL: {
      allowedHosts: [...config.allowedHosts],
      protocol: config.protocol,
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if (!isSmokeTestUser(user)) {
            throw new APIError("FORBIDDEN", {
              message: "Only smoke test users can be deleted by this route.",
            });
          }
        },
      },
    },
    trustedOrigins: [...config.trustedOrigins],
    secret: Redacted.value(config.secret),
    advanced: {
      trustedProxyHeaders: false,
      useSecureCookies: config.useSecureCookies,
      ...(config.crossSubDomainCookieDomain === undefined
        ? {}
        : {
            crossSubDomainCookies: {
              enabled: true,
              domain: config.crossSubDomainCookieDomain,
            },
          }),
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      ...(config.backgroundTaskHandler === undefined
        ? {}
        : {
            backgroundTasks: {
              handler: config.backgroundTaskHandler,
            },
          }),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    logger: {
      disabled: true,
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;

export const handleBetterAuthRequest = Effect.fn("Auth.handleAuthRequest")(
  function* (auth: BetterAuthHandler, request: Request) {
    return yield* Effect.tryPromise({
      try: () => auth.handler(request),
      catch: (cause) => AuthHandlerFailed.make({ cause }),
    });
  },
);

export const makeAuthLive = (auth: AuthSessionReader & BetterAuthHandler) =>
  Layer.succeed(Auth)({
    handleAuthRequest: (request) => handleBetterAuthRequest(auth, request),
    requirePrincipal: Effect.fn("Auth.requirePrincipal")(function* (headers) {
      if (!hasBetterAuthSessionCookie(headers)) {
        return yield* Effect.fail(
          Unauthenticated.make({ reason: "missing-session" }),
        );
      }

      const sessionResult = yield* Effect.tryPromise({
        try: () =>
          auth.api.getSession({
            headers,
            query: { disableRefresh: true },
          }),
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

function isSmokeTestUser(user: {
  readonly email: string;
  readonly name: string;
}) {
  return user.email.startsWith(smokeTestUserEmailPrefix) &&
    user.email.endsWith(smokeTestUserEmailDomain) &&
    user.name === smokeTestUserName;
}

function hasBetterAuthSessionCookie(headers: Headers) {
  const cookieHeader = headers.get("cookie");

  if (cookieHeader === null) {
    return false;
  }

  return cookieHeader
    .split(";")
    .some((cookie) =>
      betterAuthSessionCookieNames.has(cookie.trim().split("=", 1)[0] ?? ""),
    );
}
