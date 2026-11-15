import type { PackType, Status } from "./types";

export type Availability = "free" | "daily" | "shop";

// seasonal packs are paid from the free booster stock, like free packs
export function packAvailability(pack: PackType, status: Status) {
  const mode: Availability =
    pack.kind === "free" || pack.kind === "seasonal"
      ? "free"
      : pack.kind === "daily"
        ? "daily"
        : "shop";
  const unavailable =
    mode === "free"
      ? status.freeStock <= 0
      : mode === "daily"
        ? status.dailyOpenedToday
        : false;
  return { mode, unavailable };
}

// Whether "Open another" makes sense, given the status after the last opening.
export function canOpenAgain(pack: PackType, status: Status) {
  const { mode, unavailable } = packAvailability(pack, status);
  if (mode === "daily" || unavailable) return false;
  return mode === "shop" ? status.currency >= (pack.price ?? 0) : true;
}

// Local estimate of the status right after opening `pack`, used until the
// refreshed status arrives from the server.
export function statusAfterOpen(pack: PackType, status: Status): Status {
  const { mode } = packAvailability(pack, status);
  if (mode === "free") return { ...status, freeStock: status.freeStock - 1 };
  if (mode === "shop")
    return { ...status, currency: status.currency - (pack.price ?? 0) };
  return { ...status, dailyOpenedToday: true };
}
