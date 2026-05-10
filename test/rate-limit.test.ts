import { describe, expect, it } from "vitest";
import { checkLoginRateLimit } from "../src/rate-limit";
import type { Env } from "../src/types";

class MemoryKv {
  private values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    HN_SESSIONS: new MemoryKv() as unknown as KVNamespace,
    JWT_SECRET: "a".repeat(32),
    ...overrides,
  };
}

function request(ip: string): Request {
  return new Request("https://example.com/auth/login", {
    headers: { "cf-connecting-ip": ip },
  });
}

describe("login rate limiting", () => {
  it("limits repeated login attempts per client IP", async () => {
    const testEnv = env({ LOGIN_RATE_LIMIT_MAX: "2", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "60" });

    await expect(checkLoginRateLimit(testEnv, request("192.0.2.1"), 100)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(checkLoginRateLimit(testEnv, request("192.0.2.1"), 101)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(checkLoginRateLimit(testEnv, request("192.0.2.1"), 102)).resolves.toMatchObject({
      allowed: false,
      retryAfter: 58,
    });
  });

  it("resets attempts after the configured window", async () => {
    const testEnv = env({ LOGIN_RATE_LIMIT_MAX: "1", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "60" });

    await expect(checkLoginRateLimit(testEnv, request("192.0.2.2"), 100)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(checkLoginRateLimit(testEnv, request("192.0.2.2"), 161)).resolves.toMatchObject({
      allowed: true,
    });
  });
});
