import "@tanstack/react-start/server-only";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { makeRuntimeApiFetchServerFromRuntime } from "./api-runtime-fetch.server-runtime";

function getIncomingRequestHeaders() {
  return getRequest().headers;
}

// Better Auth cookies are host-only on the API origin in this slice, so SSR
// cannot authenticate by forwarding app-host cookies. Browser API calls use
// credentials: "include"; SSR calls may forward bearer auth in future flows.
export const runtimeApiFetchServer: typeof fetch =
  makeRuntimeApiFetchServerFromRuntime({
    getApiWorker: () => env.API_WORKER,
    getIncomingHeaders: getIncomingRequestHeaders,
  });
