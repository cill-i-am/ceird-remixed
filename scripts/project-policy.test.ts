import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("API auth stays on the Drizzle database path with pg as the Worker transport", () => {
  const packageJson: unknown = JSON.parse(
    fs.readFileSync(new URL("../apps/api/package.json", import.meta.url), "utf8"),
  );
  const dependencies = readDependencyRecord(packageJson, "dependencies");
  const devDependencies = readDependencyRecord(packageJson, "devDependencies");

  assert.equal(Object.hasOwn(dependencies, "@better-auth/drizzle-adapter"), true);
  assert.equal(Object.hasOwn(dependencies, "drizzle-orm"), true);
  assert.equal(Object.hasOwn(dependencies, "kysely"), false);
  assert.equal(Object.hasOwn(dependencies, "pg"), true);
  assert.equal(Object.hasOwn(devDependencies, "@types/pg"), true);
});

function readDependencyRecord(
  value: unknown,
  key: "dependencies" | "devDependencies",
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const dependencies = Object.getOwnPropertyDescriptor(value, key)?.value;

  return typeof dependencies === "object" && dependencies !== null
    ? Object.fromEntries(Object.entries(dependencies))
    : {};
}
