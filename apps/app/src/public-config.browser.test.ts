import { describe, expect, test } from "vitest";
import {
  encodePublicConfig,
  parseApiBaseUrl,
  parsePublicConfig,
  pickPublicConfig,
  publicConfigRefreshInterval,
} from "./public-config-schema";

describe("public config", () => {
  test("brands only valid API base URLs", () => {
    expect(parseApiBaseUrl("https://api.example.com").href).toBe(
      "https://api.example.com/",
    );
    expect(() => parseApiBaseUrl("not a url")).toThrow();
  });

  test("derives the public config as an allowlist from server config", () => {
    const serverConfig = {
      apiBaseUrl: parseApiBaseUrl("https://api.example.com"),
      internalOnly: "not public",
    };

    expect(encodePublicConfig(pickPublicConfig(serverConfig))).toEqual({
      apiBaseUrl: "https://api.example.com/",
    });
  });

  test("rejects invalid public config at the boundary", () => {
    expect(() => parsePublicConfig({ apiBaseUrl: "not a url" })).toThrow();
  });

  test("defines public config as five-minute runtime data", () => {
    expect(publicConfigRefreshInterval).toBe(5 * 60 * 1000);
  });
});
