const CODES = [
  "no_free_boosters",
  "insufficient_currency",
  "pack_unavailable",
  "daily_already_opened",
  "not_enough_duplicates",
  "invalid_invite",
  "username_taken",
  "already_player",
  "not_a_player",
  "cost_changed",
  "unknown_mission",
  "not_today",
  "not_complete",
  "already_claimed",
  "invalid_card",
  "no_free_copy",
  "invalid_price",
  "invalid_duration",
  "own_listing",
  "own_order",
  "not_open",
  "not_found",
  "auction_ended",
  "own_auction",
  "already_top",
  "bid_too_low",
  "has_bids",
  "invalid_trade",
  "unknown_player",
  "trade_expired",
  "too_many_trades",
  "auction_maxed",
  "no_copy",
  "invalid_showcase",
  "already_friends",
  "already_requested",
  "no_request",
] as const;

export function rpcErrorKey(message: string): string {
  const code = CODES.find((c) => message.includes(c));
  return code ? `errors.${code}` : "errors.unknown";
}

// Errors that mean the item changed meanwhile: the page reloads to show its new state.
export const STALE_ERRORS = ["errors.not_open", "errors.not_found", "errors.trade_expired", "errors.has_bids"];
