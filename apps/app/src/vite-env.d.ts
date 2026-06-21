/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    readonly API_WORKER: {
      readonly fetch: typeof fetch;
    };
  }
}
