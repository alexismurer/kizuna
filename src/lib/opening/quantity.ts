import type { PackType, Status } from "@/lib/game/types";

export const MAX_OPEN = 10;

export type QuantityPack = {
  kind: PackType["kind"];
  price: number | null;
  fallbackPrice: number | null;
};
export type QuantityStatus = Pick<Status, "freeStock" | "currency" | "dailyOpenedToday">;

const isFreeKind = (kind: PackType["kind"]) => kind === "free" || kind === "seasonal";

function maxOpenable(p: QuantityPack, s: QuantityStatus): number {
  let max: number;
  if (isFreeKind(p.kind)) {
    max = s.freeStock + (p.fallbackPrice ? Math.floor(s.currency / p.fallbackPrice) : 0);
  } else if (p.kind === "shop") {
    max = p.price ? Math.floor(s.currency / p.price) : MAX_OPEN;
  } else {
    max = s.dailyOpenedToday ? 0 : 1;
  }
  return Math.max(0, Math.min(MAX_OPEN, max));
}

// ×1, ×5 and ×max, keeping only what the player can open right now.
export function quantityOptions(p: QuantityPack, s: QuantityStatus): number[] {
  const max = maxOpenable(p, s);
  return [...new Set([1, 5, max])]
    .filter((n) => n >= 1 && n <= max)
    .sort((a, b) => a - b);
}

// Free stock is used first; the rest is paid at `price` each.
export function splitPayment(n: number, freeStock: number, price: number) {
  const free = Math.min(n, Math.max(0, freeStock));
  const paid = n - free;
  return { free, paid, cost: paid * price };
}

export function paymentFor(p: QuantityPack, s: QuantityStatus, n: number) {
  if (isFreeKind(p.kind)) return splitPayment(n, s.freeStock, p.fallbackPrice ?? 0);
  if (p.kind === "shop") return splitPayment(n, 0, p.price ?? 0);
  return splitPayment(n, n, 0);
}
