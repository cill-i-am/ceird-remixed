export type ApiRequestRoute =
  | { readonly _tag: "preflight" }
  | { readonly _tag: "public"; readonly path: "/" | "/health" | "/hello" }
  | { readonly _tag: "scoped" }
  | { readonly _tag: "not-found" }
  | { readonly _tag: "method-not-allowed"; readonly allow: string };

export function classifyApiRequest(request: Request): ApiRequestRoute {
  if (request.method === "OPTIONS") {
    return { _tag: "preflight" };
  }

  const path = new URL(request.url).pathname;

  if (isAuthRoutePath(path)) {
    return { _tag: "scoped" };
  }

  if (path === "/me" || path === "/db/health") {
    return request.method === "GET"
      ? { _tag: "scoped" }
      : { _tag: "method-not-allowed", allow: "GET" };
  }

  if (path === "/" || path === "/health" || path === "/hello") {
    return request.method === "GET"
      ? { _tag: "public", path }
      : { _tag: "method-not-allowed", allow: "GET" };
  }

  return { _tag: "not-found" };
}

function isAuthRoutePath(pathname: string) {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}
