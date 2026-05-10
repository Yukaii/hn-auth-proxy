import { describe, expect, it } from "vitest";
import { ConfigurationError, jwtSecret } from "../src/session";
import type { Env } from "../src/types";

describe("session configuration", () => {
  it("requires a sufficiently strong JWT secret", () => {
    const env = { JWT_SECRET: "short" } as Env;

    expect(() => jwtSecret(env)).toThrow(ConfigurationError);
  });

  it("accepts JWT secrets with at least 32 bytes", () => {
    const env = { JWT_SECRET: "a".repeat(32) } as Env;

    expect(jwtSecret(env)).toBe(env.JWT_SECRET);
  });
});
