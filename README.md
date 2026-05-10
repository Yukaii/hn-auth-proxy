# hn-auth-proxy

Cloudflare Worker proxy for Hacker News clients that need a service-friendly auth layer.

The Worker logs in to Hacker News with the normal `acct` / `pw` form flow, stores the returned HN `user` cookie server-side in Cloudflare KV, and returns a signed JWT for browser or PWA clients. The JWT contains only the HN username and an internal session id.

## Endpoints

- `POST /auth/login` with `{ "username": "...", "password": "..." }` returns a bearer JWT.
- `GET /auth/me` returns the current JWT-backed session.
- `POST /auth/logout` deletes the server-side HN session.
- `GET /v0/*` proxies the official Firebase Hacker News API.
- `/hn/*` proxies `news.ycombinator.com/*` with the stored HN cookie injected. Send `Authorization: Bearer <token>`.

## Local Setup

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Set `JWT_SECRET` in `.dev.vars` to a long random value.

## Cloudflare Setup

Create a KV namespace:

```sh
npx wrangler kv namespace create HN_SESSIONS
npx wrangler kv namespace create HN_SESSIONS --preview
```

Put the returned ids in `wrangler.toml`, then set the production JWT secret:

```sh
npx wrangler secret put JWT_SECRET
npm run deploy
```

## Notes

This is an unofficial Hacker News integration. The official Firebase API is read-only; logged-in actions go through the HN website and may change if Hacker News changes its form fields or cookie behavior.
