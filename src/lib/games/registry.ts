// The games in the game room. A new game is one entry here plus its page under /play/<id>.
export type GameId = "duel" | "twenty-one" | "whos-that" | "series-rush" | "most-loved";

export type GameEntry = {
  id: GameId;
  href: string;
  solo: boolean;
  multi: boolean;
  // CSS colour used for the tile's accent
  color: string;
  // lucide icon name, mapped in the game room
  icon: "swords" | "spade" | "face" | "tv" | "heart";
  // messages namespace with name, pitch and chip (arcade games)
  msg?: string;
};

export const GAMES: GameEntry[] = [
  { id: "duel", href: "/play/duel", solo: true, multi: true, color: "var(--color-accent)", icon: "swords" },
  { id: "twenty-one", href: "/play/twenty-one", solo: true, multi: false, color: "var(--color-rare)", icon: "spade", msg: "arcade.twentyOne" },
  { id: "whos-that", href: "/play/whos-that", solo: true, multi: false, color: "var(--color-epic)", icon: "face", msg: "arcade.whosThat" },
  { id: "series-rush", href: "/play/series-rush", solo: true, multi: false, color: "var(--color-legendary)", icon: "tv", msg: "arcade.seriesRush" },
  { id: "most-loved", href: "/play/most-loved", solo: true, multi: false, color: "var(--color-mythic)", icon: "heart", msg: "arcade.mostLoved" },
];
