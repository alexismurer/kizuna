import type { useFormatter } from "next-intl";

type Format = ReturnType<typeof useFormatter>;

const PCT = { style: "percent", maximumFractionDigits: 2 } as const;

// One booster's chance as a percentage; anything below 0.01 % prints "< 0.01%".
export function formatChance(format: Format, chance: number): string {
  return chance < 0.0001 ? `< ${format.number(0.0001, PCT)}` : format.number(chance, PCT);
}
