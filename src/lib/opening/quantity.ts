import type { PackType, Status } from "@/lib/game/types";

export const MAX_OPEN = 10;

export type QuantityPack = {
  id: string;
  kind: PackType["kind"];
  price: number | null;
  fallbackPrice: number | null;
};
export type QuantityStatus = Pick<
  Status,
  "freeStock" | "currency" | "dailyOpenedToday" | "rewardPacks"
>;

const isFreeKind = (kind: PackType["kind"]) => kind === "free" || kind === "seasonal";

// reward boosters granted for this pack; the daily pack has its own rule
export const rewardsFor = (p: Pick<QuantityPack, "id" | "kind">, s: Pick<Status, "rewardPacks">) =>
  p.kind === "daily" ? 0 : (s.rewardPacks[p.id] ?? 0);

function maxOpenable(p: QuantityPack, s: QuantityStatus): number {
  let max: number;
  if (isFreeKind(p.kind)) {
    max = s.freeStock + (p.fallbackPrice ? Math.floor(s.currency / p.fallbackPrice) : 0);
  } else if (p.kind === "shop") {
    max = p.price ? Math.floor(s.currency / p.price) : MAX_OPEN;
  } else if (p.kind === "prize") {
    // prize boosters only come from the prize counter
    max = 0;
  } else {
    max = s.dailyOpenedToday ? 0 : 1;
  }
  return Math.max(0, Math.min(MAX_OPEN, max + rewardsFor(p, s)));
}

// ×1, ×5 and ×max, keeping only what the player can open right now.
export function quantityOptions(p: QuantityPack, s: QuantityStatus): number[] {
  const max = maxOpenable(p, s);
  return [...new Set([1, 5, max])]
    .filter((n) => n >= 1 && n <= max)
    .sort((a, b) => a - b);
}

// Reward boosters are used first, then free stock; the rest is paid at
// `price` each. Same order as the server's cost guard.
export function splitPayment(n: number, granted: number, freeStock: number, price: number) {
  const reward = Math.min(n, Math.max(0, granted));
  const free = Math.min(n - reward, Math.max(0, freeStock));
  const paid = n - reward - free;
  return { reward, free, paid, cost: paid * price };
}

export function paymentFor(p: QuantityPack, s: QuantityStatus, n: number) {
  const granted = rewardsFor(p, s);
  if (isFreeKind(p.kind)) return splitPayment(n, granted, s.freeStock, p.fallbackPrice ?? 0);
  if (p.kind === "shop") return splitPayment(n, granted, 0, p.price ?? 0);
  if (p.kind === "prize") return splitPayment(n, granted, 0, 0);
  return splitPayment(n, 0, n, 0);
}
