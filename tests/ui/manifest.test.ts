import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("web manifest", () => {
  const m = manifest();

  it("describes an installable standalone app", () => {
    expect(m.name).toBe("Kizuna");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("has 192 and 512 icons", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});
