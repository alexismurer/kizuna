import type { Rarity } from "@/lib/game/types";

export type Friendship = "none" | "friends" | "pending_out" | "pending_in";

export type ProfileCard = {
  id: number;
  number: number;
  name: string;
  nativeName: string | null;
  imageUrl: string | null;
  rarity: Rarity;
  seriesTitle: string;
  pow: number;
  aura: number;
};

export type ProfileData = {
  id: string;
  username: string;
  avatarUrl: string | null;
  memberSince: string;
  uniqueCards: number;
  catalogSize: number;
  mythics: number;
  boostersOpened: number;
  showcase: ProfileCard[];
  wishlist: ProfileCard[];
  recentPulls: { card: ProfileCard; pulledAt: string }[];
  isMe: boolean;
  friendship: Friendship;
};
