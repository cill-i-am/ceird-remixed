import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/components/**/*.tsx",
    "src/hooks/**/*.ts",
    "src/lib/**/*.ts",
  ],
  format: "esm",
  target: "es2024",
  platform: "neutral",
  clean: true,
  dts: {
    sourcemap: true,
  },
  deps: {
    neverBundle: ["react", "react-dom", "react/jsx-runtime"],
  },
  sourcemap: true,
});
