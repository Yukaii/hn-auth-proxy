import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_HN_API_ORIGIN, DEFAULT_HN_ORIGIN, headersForHnProxy, loginToHackerNews, responseHeadersForClient, safeHnPath } from "./hn";
import { createSession, deleteSession, readSession } from "./session";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGINS ?? "*";
      if (allowed === "*") return origin || "*";

      const allowedOrigins = allowed.split(",").map((value: string) => value.trim());
      return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "";
    },
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 86400,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/login", async (c) => {
  const credentials: { username?: string; password?: string } = await c.req
    .json<{ username?: string; password?: string }>()
    .catch(() => ({}));
  const { username, password } = credentials;

  if (!username || !password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  try {
    const hn = await loginToHackerNews(username, password, c.env.HN_ORIGIN ?? DEFAULT_HN_ORIGIN);
    const session = await createSession(c.env, hn.username, hn.hnCookie);

    return c.json({
      token: session.token,
      tokenType: "Bearer",
      expiresAt: session.expiresAt,
      user: { id: hn.username },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Login failed" }, 401);
  }
});

app.get("/auth/me", async (c) => {
  try {
    const { payload, session } = await readSession(c.env, c.req.raw);
    return c.json({ user: { id: session.username }, session: { id: payload.sid, expiresAt: session.expiresAt } });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

app.post("/auth/logout", async (c) => {
  try {
    const { payload } = await readSession(c.env, c.req.raw);
    await deleteSession(c.env, payload.sid);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

app.get("/v0/:path{.*}", async (c) => {
  const path = c.req.param("path");
  const upstream = new URL(`/v0/${path}`, c.env.HN_API_ORIGIN ?? DEFAULT_HN_API_ORIGIN);
  upstream.search = new URL(c.req.url).search;

  return fetch(upstream);
});

app.all("/hn/:path{.*}", async (c) => {
  let path: string;
  try {
    path = safeHnPath(c.req.param("path"));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid path" }, 400);
  }

  let session;
  try {
    session = (await readSession(c.env, c.req.raw)).session;
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const upstream = new URL(`/${path}`, c.env.HN_ORIGIN ?? DEFAULT_HN_ORIGIN);
  upstream.search = new URL(c.req.url).search;
  const request = new Request(upstream, {
    method: c.req.method,
    headers: headersForHnProxy(c.req.raw, session),
    body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : c.req.raw.body,
    redirect: "manual",
  });
  const response = await fetch(request);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeadersForClient(response.headers),
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
