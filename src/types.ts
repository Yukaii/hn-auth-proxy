export type Env = {
  HN_SESSIONS: KVNamespace;
  JWT_SECRET: string;
  JWT_TTL_SECONDS?: string;
  LOGIN_RATE_LIMIT_MAX?: string;
  LOGIN_RATE_LIMIT_WINDOW_SECONDS?: string;
  HN_ORIGIN?: string;
  HN_API_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
};

export type SessionRecord = {
  username: string;
  hnCookie: string;
  createdAt: number;
  expiresAt: number;
};

export type JwtPayload = {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
};
