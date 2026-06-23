import { playwright } from "@vitest/browser-playwright";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [viteReact()],
  optimizeDeps: {
    include: [
      "@tanstack/start-fn-stubs",
      "effect/unstable/http/HttpClientResponse",
    ],
  },
  resolve: {
    alias: {
      "./api-runtime-fetch.server": fileURLToPath(
        new URL("./src/test/api-runtime-fetch.server.stub.ts", import.meta.url),
      ),
      "cloudflare:workers": fileURLToPath(
        new URL("./src/test/cloudflare-workers.stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
    include: ["src/**/*.browser.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
