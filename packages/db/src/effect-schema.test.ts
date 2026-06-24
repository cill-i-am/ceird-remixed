import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as Schema from "effect/Schema";
import {
  RateLimitInsertSchema,
  UserInsertSchema,
  UserSelectSchema,
} from "./effect-schema.ts";

test("Drizzle-derived Effect Schemas parse select rows", () => {
  const row = Schema.decodeUnknownSync(UserSelectSchema)({
    id: "user_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    emailVerified: false,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  assert.equal(row.email, "ada@example.com");
  assert.equal(row.emailVerified, false);
});

test("Drizzle-derived Effect Schemas keep defaulted insert columns optional", () => {
  const userInput = Schema.decodeUnknownSync(UserInsertSchema)({
    id: "user_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
  });
  const rateLimitInput = Schema.decodeUnknownSync(RateLimitInsertSchema)({
    id: "rate_limit_1",
    key: "sign-up:203.0.113.10",
    count: 1,
    lastRequest: Date.now(),
  });

  assert.equal(userInput.emailVerified, undefined);
  assert.equal(rateLimitInput.count, 1);
});
