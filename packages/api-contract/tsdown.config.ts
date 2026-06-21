import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "es2024",
  platform: "neutral",
  clean: true,
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
});
