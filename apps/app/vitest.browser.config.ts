import { playwright } from "@vitest/browser-playwright";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://api.test"),
  },
  plugins: [viteReact()],
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
