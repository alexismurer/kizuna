type Windowed = { kind: string; starts_at: string | null; ends_at: string | null };

// Players can read every pack_types row, so the client drops seasonal packs
// outside their window (starts_at <= now < ends_at); other kinds always pass.
export function isLive(p: Windowed, now: Date): boolean {
  if (p.kind !== "seasonal") return true;
  if (!p.starts_at || !p.ends_at) return false;
  return new Date(p.starts_at) <= now && now < new Date(p.ends_at);
}
