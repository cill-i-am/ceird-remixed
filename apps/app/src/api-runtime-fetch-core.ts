export interface ApiWorkerBinding {
  readonly fetch: typeof fetch;
}

export type IncomingApiHeaders = Pick<Headers, "get">;

export const forwardedApiHeaderNames = [
  "authorization",
  "b3",
  "traceparent",
  "x-b3-sampled",
  "x-b3-spanid",
  "x-b3-traceid",
] as const;

const betterAuthSessionCookieNames = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

export function withForwardedApiHeaders(
  outgoingHeaders: Headers,
  incomingHeaders?: IncomingApiHeaders,
) {
  const headers = new Headers(outgoingHeaders);

  if (incomingHeaders === undefined) {
    return headers;
  }

  for (const headerName of forwardedApiHeaderNames) {
    if (headers.has(headerName)) {
      continue;
    }

    const headerValue = incomingHeaders.get(headerName);
    if (headerValue !== null) {
      headers.set(headerName, headerValue);
    }
  }

  if (!headers.has("cookie")) {
    const sessionCookie = getBetterAuthSessionCookie(incomingHeaders);

    if (sessionCookie !== undefined) {
      headers.set("cookie", sessionCookie);
    }
  }

  return headers;
}

export function makeApiWorkerFetch(
  apiWorker: ApiWorkerBinding,
  options: Readonly<{ incomingHeaders?: IncomingApiHeaders }> = {},
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const headers = withForwardedApiHeaders(
      request.headers,
      options.incomingHeaders,
    );

    return apiWorker.fetch(new Request(request, { headers }));
  };
}

function getBetterAuthSessionCookie(
  incomingHeaders: IncomingApiHeaders,
): string | undefined {
  const cookieHeader = incomingHeaders.get("cookie");

  if (cookieHeader === null) {
    return undefined;
  }

  const sessionCookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(isBetterAuthSessionCookie);

  return sessionCookies.length === 0 ? undefined : sessionCookies.join("; ");
}

function isBetterAuthSessionCookie(cookie: string) {
  const separatorIndex = cookie.indexOf("=");

  if (separatorIndex <= 0) {
    return false;
  }

  const cookieName = cookie.slice(0, separatorIndex);
  return betterAuthSessionCookieNames.has(cookieName);
}
