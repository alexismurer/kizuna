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
