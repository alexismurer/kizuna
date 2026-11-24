import { useTranslations } from "next-intl";
import { TITLES } from "@/lib/cosmetics";

// The title a player equipped, in its own colour (shown under their name).
export function PlayerTitle({ id, className = "" }: { id: string | null | undefined; className?: string }) {
  const t = useTranslations("cosmetics.titles");
  if (!id || !TITLES[id]) return null;
  return (
    <span className={`block truncate text-xs font-semibold ${className}`} style={{ color: TITLES[id].color }}>
      {t(id)}
    </span>
  );
}
