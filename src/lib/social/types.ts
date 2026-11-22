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
  // the wiki page id; the profile page adds it to the cards public_profile returns
  sourceId?: number;
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

export type FriendEntry = { id: string; username: string; avatarUrl: string | null; since: string; unread: number };
export type RequestEntry = { username: string; avatarUrl: string | null; at: string };
export type FriendsData = { friends: FriendEntry[]; incoming: RequestEntry[]; outgoing: RequestEntry[] };

export type MessageTag = "trading" | "looking";

// One message as shown in a thread. `pending` = sent optimistically, not yet confirmed.
export type ThreadMessage = {
  id: number;
  fromId: string;
  mine: boolean;
  body: string;
  card: ProfileCard | null;
  tag: MessageTag | null;
  createdAt: string;
  readAt: string | null;
  missing?: boolean;
  pending?: boolean;
};

// One market chat message as chat_history / chat_message return it.
export type ChatMessage = {
  id: number;
  room: string;
  author: { id: string; username: string; avatarUrl: string | null };
  body: string;
  card: ProfileCard | null;
  tag: MessageTag | null;
  missing: boolean;
  mine: boolean;
  createdAt: string;
  pending?: boolean;
};

// A chat_messages row as Realtime delivers it.
export type ChatRow = { id: number; room: string; author_id: string };

// A direct_messages row as Realtime delivers it.
export type DmRow = {
  id: number;
  from_id: string;
  to_id: string;
  body: string;
  card_id: number | null;
  tag: MessageTag | null;
  created_at: string;
  read_at: string | null;
};
