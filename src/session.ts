import type { Env, JwtPayload, SessionRecord } from "./types";
import { signJwt, verifyJwt } from "./jwt";

const SESSION_PREFIX = "session:";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

export function jwtTtlSeconds(env: Env): number {
  const value = Number(env.JWT_TTL_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_SECONDS;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export async function createSession(
  env: Env,
  username: string,
  hnCookie: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ token: string; sid: string; expiresAt: number }> {
  const sid = newSessionId();
  const ttl = jwtTtlSeconds(env);
  const expiresAt = now + ttl;
  const record: SessionRecord = { username, hnCookie, createdAt: now, expiresAt };

  await env.HN_SESSIONS.put(`${SESSION_PREFIX}${sid}`, JSON.stringify(record), {
    expirationTtl: ttl,
  });

  const payload: JwtPayload = { sub: username, sid, iat: now, exp: expiresAt };
  const token = await signJwt(payload, env.JWT_SECRET);

  return { token, sid, expiresAt };
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
}

export async function readSession(
  env: Env,
  request: Request,
): Promise<{ payload: JwtPayload; session: SessionRecord }> {
  const token = bearerToken(request);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  const rawSession = await env.HN_SESSIONS.get(`${SESSION_PREFIX}${payload.sid}`);
  if (!rawSession) {
    throw new Error("Session not found");
  }

  const session = JSON.parse(rawSession) as SessionRecord;
  if (session.username !== payload.sub || session.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("Session expired");
  }

  return { payload, session };
}

export async function deleteSession(env: Env, sid: string): Promise<void> {
  await env.HN_SESSIONS.delete(`${SESSION_PREFIX}${sid}`);
}
