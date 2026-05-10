import { describe, expect, it } from "vitest";
import app from "../src/index";
import { DEFAULT_HN_ORIGIN, loginToHackerNews } from "../src/hn";
import type { Env } from "../src/types";
import { readTestEnv } from "./env";

const env = readTestEnv();
const hasCredentials = Boolean(env.HN_USERNAME && env.HN_PASSWORD);
const describeWithCredentials = hasCredentials ? describe : describe.skip;

class MemoryKv {
  private values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function testBindings(): Env {
  return {
    HN_SESSIONS: new MemoryKv() as unknown as KVNamespace,
    JWT_SECRET: "integration-test-secret-with-at-least-32-bytes",
    HN_ORIGIN: env.HN_ORIGIN || DEFAULT_HN_ORIGIN,
    HN_API_ORIGIN: env.HN_API_ORIGIN,
    LOGIN_RATE_LIMIT_MAX: "100",
  };
}

async function login(workerEnv: Env): Promise<string> {
  const response = await app.fetch(
    new Request("https://worker.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "127.0.0.1" },
      body: JSON.stringify({
        username: env.HN_USERNAME,
        password: env.HN_PASSWORD,
      }),
    }),
    workerEnv,
  );
  const body = (await response.json()) as { token?: string; error?: string };

  expect(body.error).toBeUndefined();
  expect(response.status).toBe(200);
  expect(body.token).toBeTruthy();

  return body.token ?? "";
}

function hrefs(html: string): string[] {
  return Array.from(html.matchAll(/\shref=(["'])(.*?)\1/g), (match) =>
    (match[2] ?? "").replaceAll("&amp;", "&"),
  );
}

describeWithCredentials("Hacker News integration", () => {
  it("logs in with real Hacker News credentials and receives a user cookie", async () => {
    const result = await loginToHackerNews(
      env.HN_USERNAME,
      env.HN_PASSWORD,
      env.HN_ORIGIN || DEFAULT_HN_ORIGIN,
    );

    expect(result.username).toBe(env.HN_USERNAME);
    expect(result.hnCookie).toMatch(/^user=/);
  }, 30_000);

  it("proxies item JSON, authenticated item HTML, reply form, and vote links", async () => {
    const testEnv = testBindings();
    const token = await login(testEnv);
    const authHeaders = { authorization: `Bearer ${token}` };

    const topStories = await app.fetch(
      new Request("https://worker.test/v0/topstories.json"),
      testEnv,
    );
    const storyIds = (await topStories.json()) as number[];
    const itemId = Number(env.HN_TEST_ITEM_ID || storyIds[0]);
    expect(Number.isInteger(itemId)).toBe(true);

    const itemJson = await app.fetch(
      new Request(`https://worker.test/v0/item/${itemId}.json`),
      testEnv,
    );
    const item = (await itemJson.json()) as { id?: number; type?: string };
    expect(itemJson.status).toBe(200);
    expect(item.id).toBe(itemId);

    const itemPage = await app.fetch(
      new Request(`https://worker.test/hn/item?id=${itemId}`, { headers: authHeaders }),
      testEnv,
    );
    const itemHtml = await itemPage.text();
    expect(itemPage.status).toBe(200);
    expect(itemHtml).toContain(`item?id=${itemId}`);

    const voteHref = hrefs(itemHtml).find(
      (href) =>
        href.startsWith("vote?") &&
        href.includes(`id=${itemId}`) &&
        href.includes("how=up") &&
        href.includes("auth="),
    );
    expect(voteHref).toBeTruthy();

    const replyHref = hrefs(itemHtml).find((href) => href.startsWith("reply?"));
    expect(replyHref).toBeTruthy();

    const replyPage = await app.fetch(
      new Request(`https://worker.test/hn/${replyHref}`, { headers: authHeaders }),
      testEnv,
    );
    const replyHtml = await replyPage.text();
    expect(replyPage.status).toBe(200);
    expect(replyHtml).toContain("<textarea");
    expect(replyHtml).toMatch(/<form[^>]+action="comment"[^>]+method="post"/);
  }, 30_000);
});
