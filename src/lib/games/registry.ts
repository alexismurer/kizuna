// The games in the game room. A new game is one entry here plus its page under /play/<id>.
export type GameId = "duel" | "twenty-one" | "whos-that" | "series-rush" | "most-loved" | "memory" | "daily-hand" | "kizuna-hand" | "daily-raid" | "raid" | "daily-connections" | "connections" | "expedition";

export type GameEntry = {
  id: GameId;
  href: string;
  solo: boolean;
  multi: boolean;
  // CSS colour used for the tile's accent
  color: string;
  // lucide icon name, mapped in the game room
  icon: "swords" | "spade" | "face" | "tv" | "heart" | "grid" | "calendar" | "shuffle" | "sword" | "link" | "compass";
  // messages namespace with name, pitch and chip (arcade games)
  msg?: string;
};

export const GAMES: GameEntry[] = [
  { id: "duel", href: "/play/duel", solo: true, multi: true, color: "var(--color-accent)", icon: "swords" },
  { id: "daily-hand", href: "/play/daily-hand", solo: true, multi: false, color: "var(--color-accent)", icon: "calendar", msg: "arcade.dailyHand" },
  { id: "kizuna-hand", href: "/play/kizuna-hand", solo: true, multi: false, color: "var(--color-rare)", icon: "shuffle", msg: "arcade.kizunaHand" },
  { id: "daily-raid", href: "/play/daily-raid", solo: true, multi: false, color: "var(--color-accent)", icon: "sword", msg: "arcade.dailyRaid" },
  { id: "raid", href: "/play/raid", solo: true, multi: false, color: "var(--color-mythic)", icon: "sword", msg: "arcade.kizunaRaid" },
  { id: "expedition", href: "/play/expedition", solo: true, multi: false, color: "var(--color-uncommon)", icon: "compass", msg: "arcade.expedition" },
  { id: "daily-connections", href: "/play/daily-connections", solo: true, multi: false, color: "var(--color-accent)", icon: "link", msg: "arcade.dailyConnections" },
  { id: "connections", href: "/play/connections", solo: true, multi: false, color: "var(--color-epic)", icon: "link", msg: "arcade.connections" },
  { id: "twenty-one", href: "/play/twenty-one", solo: true, multi: false, color: "var(--color-rare)", icon: "spade", msg: "arcade.twentyOne" },
  { id: "whos-that", href: "/play/whos-that", solo: true, multi: true, color: "var(--color-epic)", icon: "face", msg: "arcade.whosThat" },
  { id: "series-rush", href: "/play/series-rush", solo: true, multi: true, color: "var(--color-legendary)", icon: "tv", msg: "arcade.seriesRush" },
  { id: "most-loved", href: "/play/most-loved", solo: true, multi: true, color: "var(--color-mythic)", icon: "heart", msg: "arcade.mostLoved" },
  { id: "memory", href: "/play/memory", solo: true, multi: false, color: "var(--color-uncommon)", icon: "grid", msg: "arcade.memory" },
];
