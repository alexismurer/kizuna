// Payloads of the rebirth / awakening RPCs (supabase/migrations/0074–0076), field names as the SQL builds them.

export type RoadKey = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "boosters";

export type RoadRowData = { key: RoadKey; have: number; need: number };

// rebirth_status()
export type RebirthStatus = {
  tier: number;
  renown: number;
  multiplier: number;
  nextTier: number;
  met: number;
  total: number;
  ready: boolean;
  rows: RoadRowData[];
  checks: { noSales: boolean };
  preview: { removeCopies: number; currencyGain: number; renownBank: number };
};

// rebirth()
export type RebirthResult = {
  tier: number;
  cardsRemoved: number;
  currencyGained: number;
  renownBanked: number;
  sealPack: "seal";
};

export type AwakeningEffect = "none" | "sun" | "lightning" | "flame" | "void" | "chains" | "petals";

export type Awakening = {
  id: string;
  baseCardId: number;
  title: string;
  form: string;
  effect: AwakeningEffect;
  accent: string;
  total: number;
  issued: number;
  loopUrl: string | null;
  posterUrl: string | null;
  revealUrl: string | null;
};

export type AwakeningFace = Pick<Awakening, "title" | "form" | "effect" | "accent" | "total"> &
  Partial<Pick<Awakening, "loopUrl" | "posterUrl" | "revealUrl">>;

// awakening_catalog()
export type AwakeningCatalog = {
  revealAt: string;
  weekly: number;
  weeklyMax: number;
  thisWeek: number;
  left: number;
  nextAt: string | null;
  cards: Awakening[];
};

// my_awakenings(username?)
export type AwakeningCopy = {
  copyId: number;
  awakeningId: string;
  serial: number;
  firstOwner: string | null;
  drawnAt: string;
  listingId: number | null;
};

// awakening_market()
export type AwakeningListing = {
  listingId: number;
  copyId: number;
  awakeningId: string;
  serial: number;
  price: number;
  seller: string;
};

export type LeaderboardTab = "renown" | "collection" | "rebirth" | "mythics";

// leaderboard(tab, tier)
export type LeaderboardRow = {
  rank: number;
  username: string;
  avatar: string | null;
  tier: number;
  renown: number;
  value: number;
};

export type Leaderboard = {
  rows: LeaderboardRow[];
  cohorts: { tier: number; count: number }[];
  total: number;
};

// leaderboard_me(tab); rank is null when the player isn't ranked
export type LeaderboardMe = { rank: number | null; value: number; renown: number; tier: number };
