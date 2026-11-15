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
] as const;

export function rpcErrorKey(message: string): string {
  const code = CODES.find((c) => message.includes(c));
  return code ? `errors.${code}` : "errors.unknown";
}
