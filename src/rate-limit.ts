import type { Env } from "./types";

const LOGIN_RATE_PREFIX = "login-rate:";
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const encoder = new TextEncoder();

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loginRateLimitConfig(env: Env): { max: number; windowSeconds: number } {
  return {
    max: positiveInteger(env.LOGIN_RATE_LIMIT_MAX, DEFAULT_LOGIN_RATE_LIMIT_MAX),
    windowSeconds: positiveInteger(
      env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    ),
  };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown"
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function checkLoginRateLimit(
  env: Env,
  request: Request,
  now = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const { max, windowSeconds } = loginRateLimitConfig(env);
  const key = `${LOGIN_RATE_PREFIX}${await sha256Hex(clientIp(request))}`;
  const rawRecord = await env.HN_SESSIONS.get(key);
  const record = rawRecord ? (JSON.parse(rawRecord) as RateLimitRecord) : null;
  const current =
    record && record.resetAt > now ? record : { count: 0, resetAt: now + windowSeconds };

  if (current.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, current.resetAt - now),
    };
  }

  const next: RateLimitRecord = { count: current.count + 1, resetAt: current.resetAt };
  await env.HN_SESSIONS.put(key, JSON.stringify(next), {
    expirationTtl: Math.max(60, next.resetAt - now),
  });

  return {
    allowed: true,
    remaining: Math.max(0, max - next.count),
    retryAfter: Math.max(1, next.resetAt - now),
  };
}
