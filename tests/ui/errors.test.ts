import { describe, expect, it } from "vitest";
import { rpcErrorKey } from "@/lib/game/errors";

describe("rpcErrorKey", () => {
  it("maps known codes", () => {
    expect(rpcErrorKey("no_free_boosters")).toBe("errors.no_free_boosters");
    expect(rpcErrorKey("already_player")).toBe("errors.already_player");
  });
  it("falls back to unknown", () => {
    expect(rpcErrorKey("boom")).toBe("errors.unknown");
  });
});
