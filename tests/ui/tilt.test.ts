import { describe, expect, it } from "vitest";
import { tiltFor } from "@/lib/card/tilt";

const rect = { left: 100, top: 50, width: 200, height: 300 };

describe("tiltFor", () => {
  it("is flat at the centre", () => {
    const t = tiltFor(200, 200, rect);
    expect(t.rx).toBeCloseTo(0);
    expect(t.ry).toBeCloseTo(0);
  });
  it("turns toward the right edge", () => {
    expect(tiltFor(300, 200, rect)).toEqual({ rx: 0, ry: 12 });
  });
  it("leans back at the top edge", () => {
    expect(tiltFor(200, 50, rect)).toEqual({ rx: 12, ry: 0 });
  });
  it("clamps outside the card", () => {
    expect(tiltFor(900, 200, rect, 8).ry).toBe(8);
  });
});
