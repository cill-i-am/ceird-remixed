import { describe, expect, test } from "vitest";
import {
  parseSignInForm,
  parseSignUpForm,
} from "./form-schemas";

describe("auth form schemas", () => {
  test("parses sign-in values into trimmed branded credentials", () => {
    const values = parseSignInForm({
      email: " ada@example.com ",
      password: "correct horse",
    });

    expect(values).toEqual({
      email: "ada@example.com",
      password: "correct horse",
    });
  });

  test("rejects invalid sign-in values", () => {
    expect(() =>
      parseSignInForm({
        email: "not-an-email",
        password: "correct horse",
      }),
    ).toThrow();
    expect(() =>
      parseSignInForm({
        email: "ada@example.com",
        password: "short",
      }),
    ).toThrow();
  });

  test("parses sign-up values only when passwords match", () => {
    expect(
      parseSignUpForm({
        name: " Ada Lovelace ",
        email: " ada@example.com ",
        password: "correct horse",
        confirmPassword: "correct horse",
      }),
    ).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct horse",
      confirmPassword: "correct horse",
    });

    expect(() =>
      parseSignUpForm({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "correct horse",
        confirmPassword: "different horse",
      }),
    ).toThrow();
  });
});
