const allowedMethods = "GET,POST,OPTIONS";
const allowedHeaders = [
  "accept",
  "authorization",
  "content-type",
  "b3",
  "traceparent",
  "x-b3-sampled",
  "x-b3-spanid",
  "x-b3-traceid",
].join(",");

const localHostnames = new Set(["localhost", "127.0.0.1"]);
const ceirdSubdomainPattern = /^[a-z0-9-]+\.ceird\.app$/u;

export const betterAuthAllowedHosts = [
  "api.ceird.app",
  "remixed-api.ceird.app",
  "localhost",
  "localhost:*",
  "127.0.0.1",
  "127.0.0.1:*",
] as const;

export const betterAuthTrustedOrigins = [
  "https://app.ceird.app",
  "http://localhost:*",
  "http://127.0.0.1:*",
] as const;

export function isAllowedCredentialedOrigin(origin: string) {
  const parsed = parseOrigin(origin);

  if (parsed === null) {
    return false;
  }

  if (parsed.protocol === "http:" && localHostnames.has(parsed.hostname)) {
    return true;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  return parsed.hostname === "app.ceird.app" ||
    ceirdSubdomainPattern.test(parsed.hostname);
}

function parseOrigin(origin: string) {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

export function preflightCorsResponse(request: Request) {
  return applyCors(request, new Response(null, { status: 204 }));
}

export function applyCors(request: Request, response: Response) {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  headers.append("vary", "Origin");
  headers.append("vary", "Access-Control-Request-Method");
  headers.append("vary", "Access-Control-Request-Headers");

  if (origin !== null && isAllowedCredentialedOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", allowedMethods);
    headers.set(
      "access-control-allow-headers",
      request.headers.get("access-control-request-headers") ?? allowedHeaders,
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
