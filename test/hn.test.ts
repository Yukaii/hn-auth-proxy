import { describe, expect, it } from "vitest";
import { extractCookieValue, safeHnPath, splitSetCookieHeader } from "../src/hn";

describe("HN helpers", () => {
  it("splits combined Set-Cookie headers without splitting expires dates", () => {
    const values = splitSetCookieHeader(
      "foo=bar; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, user=alice%26hash; Path=/; HttpOnly",
    );

    expect(values).toEqual([
      "foo=bar; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/",
      "user=alice%26hash; Path=/; HttpOnly",
    ]);
  });

  it("extracts only the cookie pair", () => {
    expect(extractCookieValue(["user=alice%26hash; Path=/; HttpOnly"], "user")).toBe("user=alice%26hash");
  });

  it("rejects unsafe proxy paths", () => {
    expect(() => safeHnPath("https://example.com")).toThrow();
    expect(() => safeHnPath("login")).toThrow();
    expect(safeHnPath("/item?id=1")).toBe("item?id=1");
  });
});
