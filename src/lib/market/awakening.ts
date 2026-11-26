import type { Awakening } from "@/lib/rebirth/types";

export type AwakeningLook = Pick<Awakening, "title" | "form" | "effect" | "accent" | "total">;

// An open awakening listing, with what the card needs to draw itself
export type AwakeningLot = {
  listingId: number;
  serial: number;
  price: number;
  seller: string;
  mine: boolean;
  awakening: AwakeningLook;
  card: { name: string; image_url: string | null };
};

// One of the player's own copies; price is set while it has an open listing
export type MyAwakening = {
  copyId: number;
  serial: number;
  listingId: number | null;
  price: number | null;
  awakening: AwakeningLook;
  card: { name: string; image_url: string | null };
};
