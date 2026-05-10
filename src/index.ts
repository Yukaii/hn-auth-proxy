import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import {
  DEFAULT_HN_API_ORIGIN,
  DEFAULT_HN_ORIGIN,
  headersForHnProxy,
  loginToHackerNews,
  responseHeadersForClient,
  safeHnPath,
} from "./hn";
import { createSession, deleteSession, readSession } from "./session";
import type { Env } from "./types";

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

const OkSchema = z
  .object({
    ok: z.boolean(),
  })
  .openapi("OkResponse");

const LoginRequestSchema = z
  .object({
    username: z.string().min(1).openapi({ example: "pg" }),
    password: z.string().min(1).openapi({ format: "password" }),
  })
  .openapi("LoginRequest");

const UserSchema = z
  .object({
    id: z.string(),
  })
  .openapi("User");

const LoginResponseSchema = z
  .object({
    token: z.string(),
    tokenType: z.literal("Bearer"),
    expiresAt: z.number().int(),
    user: UserSchema,
  })
  .openapi("LoginResponse");

const MeResponseSchema = z
  .object({
    user: UserSchema,
    session: z.object({
      id: z.string().uuid(),
      expiresAt: z.number().int(),
    }),
  })
  .openapi("MeResponse");

const JsonErrorResponse = {
  description: "Error response",
  content: {
    "application/json": {
      schema: ErrorSchema,
    },
  },
} as const;

const BearerSecurity = [{ bearerAuth: [] }];

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  responses: {
    200: {
      description: "Worker is healthy",
      content: {
        "application/json": {
          schema: OkSchema,
        },
      },
    },
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Login with Hacker News credentials",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "JWT session created",
      content: {
        "application/json": {
          schema: LoginResponseSchema,
        },
      },
    },
    400: JsonErrorResponse,
    401: JsonErrorResponse,
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Read the current JWT-backed session",
  security: BearerSecurity,
  responses: {
    200: {
      description: "Current user and session",
      content: {
        "application/json": {
          schema: MeResponseSchema,
        },
      },
    },
    401: JsonErrorResponse,
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Delete the current server-side Hacker News session",
  security: BearerSecurity,
  responses: {
    200: {
      description: "Session deleted",
      content: {
        "application/json": {
          schema: OkSchema,
        },
      },
    },
    401: JsonErrorResponse,
  },
});

const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    return undefined;
  },
});

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGINS ?? "*";
      if (allowed === "*") return origin || "*";

      const allowedOrigins = allowed.split(",").map((value: string) => value.trim());
      return origin && allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? "");
    },
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 86400,
  }),
);

app.openapi(healthRoute, (c) => c.json({ ok: true }, 200));

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.doc31("/openapi.json", (c) => ({
  openapi: "3.1.0",
  info: {
    title: "hn-auth-proxy",
    version: "0.1.0",
    description:
      "Cloudflare Worker proxy that stores Hacker News session cookies server-side and exposes JWT auth for clients.",
  },
  servers: [
    {
      url: new URL(c.req.url).origin,
      description: "Current environment",
    },
  ],
}));

app.openapi(loginRoute, async (c) => {
  const credentials = c.req.valid("json");
  const { username, password } = credentials;

  try {
    const hn = await loginToHackerNews(username, password, c.env.HN_ORIGIN ?? DEFAULT_HN_ORIGIN);
    const session = await createSession(c.env, hn.username, hn.hnCookie);

    return c.json(
      {
        token: session.token,
        tokenType: "Bearer",
        expiresAt: session.expiresAt,
        user: { id: hn.username },
      },
      200,
    );
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Login failed" }, 401);
  }
});

app.openapi(meRoute, async (c) => {
  try {
    const { payload, session } = await readSession(c.env, c.req.raw);
    return c.json(
      {
        user: { id: session.username },
        session: { id: payload.sid, expiresAt: session.expiresAt },
      },
      200,
    );
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

app.openapi(logoutRoute, async (c) => {
  try {
    const { payload } = await readSession(c.env, c.req.raw);
    await deleteSession(c.env, payload.sid);
    return c.json({ ok: true }, 200);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

app.openAPIRegistry.registerPath({
  method: "get",
  path: "/v0/{path}",
  tags: ["Hacker News API"],
  summary: "Proxy the official Firebase Hacker News API",
  request: {
    params: z.object({
      path: z.string().openapi({
        description: "Firebase API path, for example topstories.json or item/8863.json.",
      }),
    }),
  },
  responses: {
    200: {
      description: "Raw upstream Firebase API response",
    },
  },
});

app.get("/v0/:path{.*}", async (c) => {
  const path = c.req.param("path");
  const upstream = new URL(`/v0/${path}`, c.env.HN_API_ORIGIN ?? DEFAULT_HN_API_ORIGIN);
  upstream.search = new URL(c.req.url).search;

  return fetch(upstream);
});

app.openAPIRegistry.registerPath({
  method: "get",
  path: "/hn/{path}",
  tags: ["Hacker News Web"],
  summary: "Proxy a Hacker News web endpoint with the stored HN user cookie",
  security: BearerSecurity,
  request: {
    params: z.object({
      path: z.string().openapi({
        description: "HN web path, for example news, item, vote, or reply.",
      }),
    }),
  },
  responses: {
    200: {
      description: "Raw upstream Hacker News response",
    },
    400: JsonErrorResponse,
    401: JsonErrorResponse,
  },
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
