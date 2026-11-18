export function completionPct(unique: number, total: number): number {
  return total > 0 ? Math.round((unique / total) * 100) : 0;
}

export function initial(username: string): string {
  return (username.trim()[0] ?? "?").toUpperCase();
}

export function matchesCard(card: { name: string; seriesTitle: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || card.name.toLowerCase().includes(q) || card.seriesTitle.toLowerCase().includes(q);
}
