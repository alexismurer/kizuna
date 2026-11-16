export const MIN_PRICE = 1;
export const MAX_PRICE = 1_000_000;

// Mirrors the server's market_fee: 5 %, rounded down.
export function marketFee(price: number): number {
  return Math.floor((price * 5) / 100);
}

export function net(price: number): number {
  return price - marketFee(price);
}

// Price vs estimated value, in percent (rounded); null without a value.
export function valueDelta(price: number, value: number | null): number | null {
  if (!value) return null;
  return Math.round(((price - value) / value) * 100);
}

export function validPrice(price: number): boolean {
  return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

// Time left as "h:mm:ss" (or "m:ss" under an hour); null once ended.
export function formatCountdown(ms: number): string | null {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
