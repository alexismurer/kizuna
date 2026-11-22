// Copies the player can list: free ones (count - locked), none while the card is locked.
export function sellableCopies(row: { count: number; locked: number; protected: boolean }): number {
  return row.protected ? 0 : Math.max(0, row.count - row.locked);
}
