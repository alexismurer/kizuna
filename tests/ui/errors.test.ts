import { describe, expect, it } from "vitest";
import { rpcErrorKey } from "@/lib/game/errors";

describe("rpcErrorKey", () => {
  it("maps known codes", () => {
    expect(rpcErrorKey("no_free_boosters")).toBe("errors.no_free_boosters");
    expect(rpcErrorKey("already_player")).toBe("errors.already_player");
    expect(rpcErrorKey("cost_changed")).toBe("errors.cost_changed");
    expect(rpcErrorKey("not_today")).toBe("errors.not_today");
    expect(rpcErrorKey("already_claimed")).toBe("errors.already_claimed");
    expect(rpcErrorKey("invalid_card")).toBe("errors.invalid_card");
    for (const c of ["no_free_copy", "invalid_price", "invalid_duration", "own_listing", "own_order", "not_open", "not_found", "auction_ended", "own_auction", "already_top", "has_bids"]) {
      expect(rpcErrorKey(c)).toBe(`errors.${c}`);
    }
  });
  it("maps bid_too_low with its minimum appended", () => {
    expect(rpcErrorKey("bid_too_low:1500")).toBe("errors.bid_too_low");
  });
  it("falls back to unknown", () => {
    expect(rpcErrorKey("boom")).toBe("errors.unknown");
  });
});
