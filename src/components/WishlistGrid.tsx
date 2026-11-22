import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CardView, type CardData } from "./card/CardView";

export type WishlistItem = { card: CardData & { sourceId: number }; owned: boolean };

// Wishlisted cards in catalog order; owned ones are marked.
export function WishlistGrid({ items, total }: { items: WishlistItem[]; total: number }) {
  const t = useTranslations("collection");
  if (items.length === 0) return <p className="text-common">{t("wishlistEmpty")}</p>;
  const shown = [...items].sort((a, b) => a.card.number - b.card.number);
  return (
    <ul className="grid grid-cols-2 justify-items-center gap-3 md:grid-cols-[repeat(auto-fill,10rem)] md:justify-start">
      {shown.map(({ card, owned }) => (
        <li key={card.id} className="relative">
          <Link href={`/wiki/${card.sourceId}`}>
            <CardView card={{ ...card, total }} size="md" />
          </Link>
          {owned && (
            <span className="absolute -right-1 -top-1 rounded-full bg-uncommon px-2 py-0.5 text-xs font-bold text-black">
              {t("owned")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
