import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const requiredPublicEnvKeys = ["VITE_API_URL"] as const;

function requirePublicEnv(keys: ReadonlyArray<string>): Plugin {
  return {
    name: "ceird-required-public-env",
    enforce: "post",
    configResolved(config) {
      const missingKeys = keys.filter((key) => {
        const definedValue = readDefinedString(
          config.define?.[`import.meta.env.${key}`],
        );
        const processValue = process.env[key];

        return definedValue === undefined && !processValue;
      });

      if (missingKeys.length > 0) {
        throw new Error(
          `Missing required public env: ${missingKeys.join(", ")}. Pass it through Alchemy Cloudflare.Vite env or an explicit local Vite env value.`,
        );
      }
    },
  };
}

function readDefinedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" && parsed.length > 0
      ? parsed
      : undefined;
  } catch {
    return value.length > 0 ? value : undefined;
  }
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    requirePublicEnv(requiredPublicEnvKeys),
    tanstackStart(),
    viteReact(),
  ],
});
