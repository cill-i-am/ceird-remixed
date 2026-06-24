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

const betterAuthSessionCookieSuffix = "better-auth.session_token";

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

  const authCookieHeader = selectBetterAuthCookieHeader(
    incomingHeaders.get("cookie"),
  );
  if (authCookieHeader !== undefined && !headers.has("cookie")) {
    headers.set("cookie", authCookieHeader);
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

export function selectBetterAuthCookieHeader(
  cookieHeader: string | null,
): string | undefined {
  if (cookieHeader === null) {
    return undefined;
  }

  const authCookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => {
      const name = cookie.split("=", 1)[0];
      return name?.endsWith(betterAuthSessionCookieSuffix) ?? false;
    });

  return authCookies.length === 0 ? undefined : authCookies.join("; ");
}
