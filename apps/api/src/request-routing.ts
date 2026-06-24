export type ApiRequestRoute =
  | { readonly _tag: "preflight" }
  | { readonly _tag: "public"; readonly path: "/" | "/health" | "/hello" }
  | { readonly _tag: "scoped" };

export function classifyApiRequest(request: Request): ApiRequestRoute {
  if (request.method === "OPTIONS") {
    return { _tag: "preflight" };
  }

  if (request.method !== "GET") {
    return { _tag: "scoped" };
  }

  const path = new URL(request.url).pathname;

  if (path === "/" || path === "/health" || path === "/hello") {
    return { _tag: "public", path };
  }

  return { _tag: "scoped" };
}
