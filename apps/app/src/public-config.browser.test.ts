import { describe, expect, test } from "vitest";
import {
  deriveAuthBaseUrl,
  encodePublicConfig,
  parseApiBaseUrl,
  parseAuthBaseUrl,
  parsePublicConfig,
  pickPublicConfig,
  publicConfigRefreshInterval,
} from "./public-config-schema";

describe("public config", () => {
  test("brands only valid API base URLs", () => {
    expect(parseApiBaseUrl("https://api.example.com").href).toBe(
      "https://api.example.com/",
    );
    expect(parseApiBaseUrl("http://localhost:8787").href).toBe(
      "http://localhost:8787/",
    );
    expect(parseApiBaseUrl("http://127.0.0.1:8787").href).toBe(
      "http://127.0.0.1:8787/",
    );
    expect(parseApiBaseUrl("http://[::1]:8787").href).toBe(
      "http://[::1]:8787/",
    );
    expect(() => parseApiBaseUrl("not a url")).toThrow();
    expect(() => parseApiBaseUrl("http://api.example.com")).toThrow();
    expect(() => parseApiBaseUrl("https://api.example.com/path")).toThrow();
    expect(() => parseApiBaseUrl("https://api.example.com?x=1")).toThrow();
    expect(() => parseApiBaseUrl("https://api.example.com#hash")).toThrow();
    expect(() => parseApiBaseUrl("https://user:pass@api.example.com"))
      .toThrow();
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

  test("derives a separately branded auth base URL from the API base URL", () => {
    const apiBaseUrl = parseApiBaseUrl("https://api.example.com");
    const authBaseUrl = deriveAuthBaseUrl(apiBaseUrl);

    expect(authBaseUrl.href).toBe("https://api.example.com/");
    expect(parseAuthBaseUrl(authBaseUrl.href).href).toBe(authBaseUrl.href);
  });

  test("brands only HTTPS or local loopback auth origins", () => {
    expect(parseAuthBaseUrl("https://api.example.com").href).toBe(
      "https://api.example.com/",
    );
    expect(() => parseAuthBaseUrl("http://api.example.com")).toThrow();
    expect(parseAuthBaseUrl("http://localhost:8787").href).toBe(
      "http://localhost:8787/",
    );
    expect(parseAuthBaseUrl("http://127.0.0.1:8787").href).toBe(
      "http://127.0.0.1:8787/",
    );
    expect(parseAuthBaseUrl("http://[::1]:8787").href).toBe(
      "http://[::1]:8787/",
    );
    expect(() => parseAuthBaseUrl("https://api.example.com/path")).toThrow();
    expect(() => parseAuthBaseUrl("https://api.example.com?x=1")).toThrow();
    expect(() => parseAuthBaseUrl("https://api.example.com#hash")).toThrow();
    expect(() => parseAuthBaseUrl("https://user:pass@api.example.com"))
      .toThrow();
  });

  test("rejects invalid public config at the boundary", () => {
    expect(() => parsePublicConfig({ apiBaseUrl: "not a url" })).toThrow();
  });

  test("defines public config as five-minute runtime data", () => {
    expect(publicConfigRefreshInterval).toBe(5 * 60 * 1000);
  });
});
