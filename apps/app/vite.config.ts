import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  optimizeDeps: {
    exclude: [
      "@base-ui/react",
      "@base-ui/react/button",
      "@base-ui/react/merge-props",
      "@base-ui/react/use-render",
    ],
    include: ["better-auth/react"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 3000,
  },
  plugins: [tanstackStart(), tailwindcss(), viteReact()],
});
