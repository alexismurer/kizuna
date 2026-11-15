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
