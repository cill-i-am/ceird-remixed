import { playwright } from "@vitest/browser-playwright";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  optimizeDeps: {
    exclude: [
      "@base-ui/react",
      "@base-ui/react/button",
      "@base-ui/react/merge-props",
      "@base-ui/react/use-render",
    ],
    include: [
      "@tanstack/start-fn-stubs",
      "better-auth/react",
      "effect/unstable/http/HttpClientResponse",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
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
