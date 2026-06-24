import "@tanstack/react-start/server-only";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { makeApiWorkerFetch } from "./api-runtime-fetch-core";

function getIncomingRequestHeaders() {
  return getRequest().headers;
}

export const runtimeApiFetchServer: typeof fetch = async (input, init) => {
  const incomingHeaders = getIncomingRequestHeaders();
  // Better Auth cookies are host-only on the API origin in this slice, so SSR
  // cannot authenticate by forwarding app-host cookies. Browser API calls use
  // credentials: "include"; SSR calls may forward bearer auth in future flows.
  const apiWorkerFetch = makeApiWorkerFetch(env.API_WORKER, {
    incomingHeaders,
  });

  return apiWorkerFetch(input, init);
};
