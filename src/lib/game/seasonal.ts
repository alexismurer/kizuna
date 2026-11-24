type Windowed = { id?: string; kind: string; starts_at: string | null; ends_at: string | null };

// Players can read every pack_types row, so the client drops seasonal packs
// outside their window (starts_at <= now < ends_at); other kinds always pass.
// Prize boosters are live too: the server only opens one that was granted.
export function isLive(p: Windowed, now: Date): boolean {
  if (p.kind !== "seasonal") return true;
  if (!p.starts_at || !p.ends_at) return false;
  return new Date(p.starts_at) <= now && now < new Date(p.ends_at);
}

// Shown among the boosters: live, and for prize boosters only while the player
// holds one (`held` = reward packs by id).
export function isListed(p: Windowed, now: Date, held: Record<string, number>): boolean {
  if (p.kind === "prize") return (held[p.id ?? ""] ?? 0) > 0;
  return isLive(p, now);
}
