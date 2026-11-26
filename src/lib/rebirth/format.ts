import { COLOR } from "@/components/card/rarityColor";
import type { RebirthStatus, RoadKey } from "./types";

export const BOOSTERS_COLOR = "#f2643d";

// Conditions met: road rows at or past their need plus the boolean checks that pass (out of status.total).
export function conditionsMet(status: Pick<RebirthStatus, "rows" | "checks">): number {
  const rows = status.rows.filter((r) => r.have >= r.need).length;
  const checks = Object.values(status.checks).filter(Boolean).length;
  return rows + checks;
}

export function rowColor(key: RoadKey): string {
  return key === "boosters" ? BOOSTERS_COLOR : COLOR[key];
}
