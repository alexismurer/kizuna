import { useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import { RarityBadge } from "@/components/RarityBadge";
import { Link } from "@/i18n/navigation";
import type { MessageTag, ProfileCard } from "@/lib/social/types";

// The card a message carries: mini card, a TRADING / LOOKING FOR chip, an
// optional "missing" note, and (on other players' messages) a link that opens
// the trade composer prefilled.
export function CardAttachment({
  card,
  tag,
  missing = false,
  from,
  mine,
}: {
  card: ProfileCard;
  tag: MessageTag;
  missing?: boolean;
  from: string;
  mine: boolean;
}) {
  const t = useTranslations("dm");
  const href = `/market?tab=trades&to=${encodeURIComponent(from)}&${tag === "trading" ? "want" : "give"}=${card.id}`;
  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-border bg-bg/60 p-2 text-left">
      <div className="flex items-center gap-2">
        <span
          className="h-14 w-10 shrink-0 overflow-hidden rounded border-2 bg-border"
          style={{ borderColor: COLOR[card.rarity] }}
        >
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-bold">{card.name}</span>
            <RarityBadge rarity={card.rarity} className="h-4 w-4 text-[9px]" />
          </span>
          <span className="truncate text-xs text-common">{card.seriesTitle}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span
          className={`rounded-full border px-2 py-0.5 tracking-wider ${tag === "trading" ? "border-uncommon text-uncommon" : "border-rare text-rare"}`}
        >
          {tag === "trading" ? t("tagTrading") : t("tagLooking")}
        </span>
        {missing && <span className="rounded-full bg-accent px-2 py-0.5 text-black">{t("missing")}</span>}
        {!mine && (
          <Link href={href} className="ml-auto text-accent underline">
            {t("trade")}
          </Link>
        )}
      </div>
    </div>
  );
}
