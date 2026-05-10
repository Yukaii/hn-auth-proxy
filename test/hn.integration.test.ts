import { describe, expect, it } from "vitest";
import { DEFAULT_HN_ORIGIN, loginToHackerNews } from "../src/hn";
import { readTestEnv } from "./env";

const env = readTestEnv();
const hasCredentials = Boolean(env.HN_USERNAME && env.HN_PASSWORD);
const describeWithCredentials = hasCredentials ? describe : describe.skip;

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
});
