import "@tanstack/react-start/server-only";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { makeRuntimeApiFetchServerFromRuntime } from "./api-runtime-fetch.server-runtime";

function getIncomingRequestHeaders() {
  return getRequest().headers;
}

// Better Auth uses shared ceird.app cookies in deployed stages. SSR forwards
// only the session cookie through the API service binding; browser calls still
// use credentials: "include".
export const runtimeApiFetchServer: typeof fetch =
  makeRuntimeApiFetchServerFromRuntime({
    getApiWorker: () => env.API_WORKER,
    getIncomingHeaders: getIncomingRequestHeaders,
  });
