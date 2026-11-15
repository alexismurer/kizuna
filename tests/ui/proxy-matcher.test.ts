import { describe, expect, it, vi } from "vitest";
import { config } from "@/proxy";

vi.mock("next-intl/middleware", () => ({ default: () => () => undefined }));

describe("proxy matcher", () => {
  const re = new RegExp(`^${config.matcher}$`);

  it("routes app paths through next-intl", () => {
    expect(re.test("/")).toBe(true);
    expect(re.test("/collection")).toBe(true);
    expect(re.test("/en/card/1")).toBe(true);
  });

  it("skips assets and internals", () => {
    expect(re.test("/favicon.ico")).toBe(false);
    expect(re.test("/_next/static/x.js")).toBe(false);
    expect(re.test("/api/foo")).toBe(false);
  });
});
