// The server flags every copy of a card the player didn't own before; within
// one batch only the first copy is really new.
export function newFlags(rows: { card_id: number; is_new: boolean }[]): boolean[] {
  const seen = new Set<number>();
  return rows.map((r) => {
    const first = !seen.has(r.card_id);
    seen.add(r.card_id);
    return r.is_new && first;
  });
}
