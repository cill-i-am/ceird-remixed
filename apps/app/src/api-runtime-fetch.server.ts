import "@tanstack/react-start/server-only";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { makeApiWorkerFetch } from "./api-runtime-fetch-core";

function getIncomingRequestHeaders() {
  return getRequest().headers;
}

export const runtimeApiFetchServer: typeof fetch = async (input, init) => {
  const incomingHeaders = getIncomingRequestHeaders();
  const apiWorkerFetch = makeApiWorkerFetch(env.API_WORKER, {
    incomingHeaders,
  });

  return apiWorkerFetch(input, init);
};
