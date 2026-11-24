type Windowed = { id?: string; kind: string; starts_at: string | null; ends_at: string | null };

// Players can read every pack_types row, so the client drops seasonal packs
// outside their window (starts_at <= now < ends_at), and prize boosters the
// player doesn't hold (`held` = reward packs by id); other kinds always pass.
export function isLive(p: Windowed, now: Date, held: Record<string, number> = {}): boolean {
  if (p.kind === "prize") return (held[p.id ?? ""] ?? 0) > 0;
  if (p.kind !== "seasonal") return true;
  if (!p.starts_at || !p.ends_at) return false;
  return new Date(p.starts_at) <= now && now < new Date(p.ends_at);
}
