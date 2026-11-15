import { describe, expect, it } from "vitest";
import { createHoldTracker, createTearTracker } from "@/lib/opening/gesture";

describe("createTearTracker", () => {
  it("does not start outside the top band", () => {
    const t = createTearTracker(200);
    expect(t.start(10, 80, 54)).toBe(false);
    expect(t.end()).toBe("cancel");
  });

  it("starts inside the top band", () => {
    expect(createTearTracker(200).start(10, 20, 54)).toBe(true);
  });

  it("cancels at 50 % travel", () => {
    const t = createTearTracker(200);
    t.start(10, 20, 54);
    expect(t.move(110)).toBeCloseTo(0.5);
    expect(t.end()).toBe("cancel");
  });

  it("tears at 75 % travel", () => {
    const t = createTearTracker(200);
    t.start(10, 20, 54);
    expect(t.move(160)).toBeCloseTo(0.75);
    expect(t.end()).toBe("torn");
  });

  it("counts right-to-left travel and keeps the maximum", () => {
    const t = createTearTracker(200);
    t.start(190, 20, 54);
    t.move(30);
    expect(t.move(100)).toBeCloseTo(0.8);
    expect(t.end()).toBe("torn");
  });

  it("ignores moves when not started", () => {
    const t = createTearTracker(200);
    t.start(10, 90, 54);
    expect(t.move(200)).toBe(0);
  });
});

describe("createHoldTracker", () => {
  it("cancels when released at 500 ms", () => {
    const h = createHoldTracker();
    h.start(1000);
    expect(h.end(1500)).toBe("cancel");
  });

  it("reports progress while holding", () => {
    const h = createHoldTracker();
    h.start(1000);
    expect(h.tick(1400)).toBeCloseTo(0.5);
    expect(h.tick(2000)).toBe(1);
  });

  it("is held when released at 820 ms", () => {
    const h = createHoldTracker(800);
    h.start(1000);
    expect(h.end(1820)).toBe("held");
  });

  it("cancels when never started", () => {
    expect(createHoldTracker().end(5000)).toBe("cancel");
  });
});
