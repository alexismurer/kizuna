// Maps an admin RPC error code to its message key (falls back to a generic one).
const KNOWN = ["not_admin", "invalid_count", "invite_used", "invite_not_found", "player_not_found", "invalid_amount", "invalid_pool", "invalid_seasonal", "seasonal_title", "seasonal_series", "seasonal_dates", "suggest_failed"];
export const adminErrorKey = (code: string) => (KNOWN.includes(code) ? code : "generic");
