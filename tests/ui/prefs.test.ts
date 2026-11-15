import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrefs, writePrefs } from "@/lib/fx/prefs";
import { playSfx } from "@/lib/fx/sound";

const defaults = { animations: true, warnPaid: true, sound: false };
const throwing = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
} as unknown as Storage;

describe("prefs", () => {
  it("returns defaults without storage", () => {
    expect(readPrefs(null)).toEqual(defaults);
  });

  it("merges stored partial prefs with defaults", () => {
    const s = { getItem: () => '{"sound":true}' } as unknown as Storage;
    expect(readPrefs(s)).toEqual({ ...defaults, sound: true });
  });

  it("falls back to defaults on bad JSON or throwing storage", () => {
    const bad = { getItem: () => "{nope" } as unknown as Storage;
    expect(readPrefs(bad)).toEqual(defaults);
    expect(readPrefs(throwing)).toEqual(defaults);
  });

  it("writePrefs swallows storage errors", () => {
    expect(() => writePrefs(defaults, throwing)).not.toThrow();
  });
});

describe("playSfx", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not construct an AudioContext when disabled", () => {
    const ctor = vi.fn();
    vi.stubGlobal("AudioContext", ctor);
    playSfx("flip", false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("no-ops when AudioContext is missing", () => {
    expect(() => playSfx("tear", true)).not.toThrow();
  });
});
