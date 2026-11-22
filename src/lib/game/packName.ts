// A pack's display name: today's pool for the daily pack, the custom title (or "Seasonal")
// for seasonal packs, the translated name otherwise.
export function packName(
  t: (key: string) => string,
  pack: { id: string; kind: string; title: string | null },
  dailyName: string | null,
): string {
  return pack.kind === "daily" && dailyName
    ? dailyName
    : pack.kind === "seasonal"
      ? (pack.title ?? t("packs.seasonal.name"))
      : t(`packs.${pack.id}.name`);
}
