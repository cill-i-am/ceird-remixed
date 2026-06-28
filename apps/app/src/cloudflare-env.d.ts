import type { ApiWorkerBinding } from "./api-runtime-fetch-core";

declare global {
  namespace Cloudflare {
    interface Env {
      readonly API_URL: string;
      readonly API_WORKER: ApiWorkerBinding;
    }
  }
}

export {};
