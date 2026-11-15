import { describe, expect, it } from "vitest";
import { rpcErrorKey } from "@/lib/game/errors";

describe("rpcErrorKey", () => {
  it("maps known codes", () => {
    expect(rpcErrorKey("no_free_boosters")).toBe("errors.no_free_boosters");
    expect(rpcErrorKey("already_player")).toBe("errors.already_player");
    expect(rpcErrorKey("cost_changed")).toBe("errors.cost_changed");
    expect(rpcErrorKey("not_today")).toBe("errors.not_today");
    expect(rpcErrorKey("already_claimed")).toBe("errors.already_claimed");
  });
  it("falls back to unknown", () => {
    expect(rpcErrorKey("boom")).toBe("errors.unknown");
  });
});
