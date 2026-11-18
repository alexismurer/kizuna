import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrefs } from "@/lib/fx/prefs";

const KEY = "kizuna.prefs";

function mockMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  window.matchMedia = globalThis.matchMedia;
}

describe("usePrefs", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMedia(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reflects stored prefs after mount", () => {
    localStorage.setItem(KEY, JSON.stringify({ warnPaid: false }));
    const { result } = renderHook(() => usePrefs());
    expect(result.current[0]).toEqual({
      animations: true,
      warnPaid: false,
      sound: false,
    });
  });

  it("update persists and merges with another tab's write", () => {
    const { result } = renderHook(() => usePrefs());
    localStorage.setItem(KEY, JSON.stringify({ warnPaid: false }));
    act(() => result.current[1]({ sound: true }));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      animations: true,
      warnPaid: false,
      sound: true,
    });
    expect(result.current[0].warnPaid).toBe(false);
  });

  it("reduced motion forces animations off without changing storage", () => {
    mockMedia(true);
    localStorage.setItem(KEY, JSON.stringify({ animations: true }));
    const { result } = renderHook(() => usePrefs());
    expect(result.current[0].animations).toBe(false);
    act(() => result.current[1]({ sound: true }));
    expect(JSON.parse(localStorage.getItem(KEY)!).animations).toBe(true);
  });
});
