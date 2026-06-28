import {
  type ApiWorkerBinding,
  type IncomingApiHeaders,
  makeApiWorkerFetch,
} from "./api-runtime-fetch-core";

/**
 * Dependencies needed to build the server-side API fetch adapter.
 */
export interface RuntimeApiFetchServerDependencies {
  readonly apiWorker: ApiWorkerBinding;
  readonly incomingHeaders: IncomingApiHeaders;
}

/**
 * Runtime readers used to compose the SSR API fetch adapter at request time.
 */
export interface RuntimeApiFetchServerRuntime {
  readonly getApiWorker: () => ApiWorkerBinding;
  readonly getIncomingHeaders: () => IncomingApiHeaders;
}

/**
 * Build the server-side API fetch adapter from runtime request and binding data.
 */
export function makeRuntimeApiFetchServer({
  apiWorker,
  incomingHeaders,
}: RuntimeApiFetchServerDependencies): typeof fetch {
  return makeApiWorkerFetch(apiWorker, { incomingHeaders });
}

/**
 * Build the server-side API fetch adapter from runtime binding and request readers.
 */
export function makeRuntimeApiFetchServerFromRuntime({
  getApiWorker,
  getIncomingHeaders,
}: RuntimeApiFetchServerRuntime): typeof fetch {
  return async (input, init) => {
    const apiWorkerFetch = makeRuntimeApiFetchServer({
      apiWorker: getApiWorker(),
      incomingHeaders: getIncomingHeaders(),
    });

    return apiWorkerFetch(input, init);
  };
}
