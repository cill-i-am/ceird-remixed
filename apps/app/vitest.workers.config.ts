import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const apiUrl = "https://api.test";

async function apiWorkerBinding(request: Request) {
  return Response.json({
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  });
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          API_URL: apiUrl,
        },
        compatibilityDate: "2026-03-17",
        compatibilityFlags: ["nodejs_compat"],
        serviceBindings: {
          API_WORKER: apiWorkerBinding,
        },
      },
    }),
  ],
  test: {
    include: ["src/**/*.workers.test.ts"],
  },
});
