// The games in the game room. A new game is one entry here plus its page under /play/<id>.
export type GameId = "duel";

export type GameEntry = {
  id: GameId;
  href: string;
  solo: boolean;
  multi: boolean;
  // CSS colour used for the tile's accent
  color: string;
};

export const GAMES: GameEntry[] = [{ id: "duel", href: "/play/duel", solo: true, multi: true, color: "var(--color-accent)" }];
