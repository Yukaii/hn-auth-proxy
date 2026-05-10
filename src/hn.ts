import type { SessionRecord } from "./types";

export const DEFAULT_HN_ORIGIN = "https://news.ycombinator.com";
export const DEFAULT_HN_API_ORIGIN = "https://hacker-news.firebaseio.com";

type HnLoginResult = {
  username: string;
  hnCookie: string;
};

export function splitSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]*;)/).map((part) => part.trim());
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? splitSetCookieHeader(combined) : [];
}

export function extractCookieValue(setCookieHeaders: string[], name: string): string | null {
  const prefix = `${name}=`;
  const cookie = setCookieHeaders.find((value) => value.toLowerCase().startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return cookie.split(";", 1)[0] ?? null;
}

export async function loginToHackerNews(
  username: string,
  password: string,
  hnOrigin = DEFAULT_HN_ORIGIN,
): Promise<HnLoginResult> {
  const body = new URLSearchParams({ acct: username, pw: password, goto: "news" });
  const response = await fetch(`${hnOrigin}/login`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "hn-auth-proxy/0.1",
    },
  });

  const hnCookie = extractCookieValue(getSetCookieHeaders(response.headers), "user");
  if (hnCookie && (response.status === 302 || response.status === 303)) {
    return { username, hnCookie };
  }

  const text = await response.text();
  if (text.includes("Bad login")) {
    throw new Error("Bad Hacker News username or password");
  }

  throw new Error(`Hacker News login did not return a session cookie; status ${response.status}`);
}

export function safeHnPath(path: string): string {
  const normalized = path.replace(/^\/+/, "");

  if (!normalized || normalized.includes("://") || normalized.includes("//")) {
    throw new Error("Invalid Hacker News path");
  }

  if (normalized === "login" || normalized === "logout") {
    throw new Error("Use the proxy auth endpoints for login and logout");
  }

  return normalized;
}

export function headersForHnProxy(request: Request, session: SessionRecord): Headers {
  const headers = new Headers();
  const passThrough = ["accept", "accept-language", "content-type", "user-agent"];

  for (const name of passThrough) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("cookie", session.hnCookie);
  return headers;
}

export function responseHeadersForClient(headers: Headers): Headers {
  const next = new Headers(headers);

  for (const name of [
    "content-encoding",
    "content-length",
    "set-cookie",
    "set-cookie2",
    "transfer-encoding",
    "x-frame-options",
  ]) {
    next.delete(name);
  }

  return next;
}
