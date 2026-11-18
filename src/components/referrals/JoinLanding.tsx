import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { COLOR } from "@/components/card/CardView";
import { Avatar } from "@/components/social/Avatar";
import type { Rarity } from "@/lib/game/types";

export type JoinPreview = {
  username: string;
  avatarUrl: string | null;
  cards: { name: string; imageUrl: string | null; rarity: Rarity }[];
};

export function JoinLanding({
  code,
  preview,
  signedIn = false,
}: {
  code: string;
  preview: JoinPreview | null;
  signedIn?: boolean;
}) {
  const t = useTranslations("join");
  if (!preview) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold">{t("broken")}</h1>
        <p className="text-common">{t("brokenHint")}</p>
      </div>
    );
  }
  const cards = preview.cards.slice(0, 3);
  return (
    <div data-code={code} className="flex flex-col gap-5">
      <div className="flex">
        <Avatar url={preview.avatarUrl} username={preview.username} size={72} />
      </div>
      <h1 className="break-words font-display text-4xl font-extrabold">
        {t("invited", { name: preview.username })}
      </h1>
      {cards.length > 0 && (
        <ul className="flex -space-x-4 pl-2" aria-label={t("cards")}>
          {cards.map((c, i) => (
            <li
              key={i}
              className="aspect-[2/3] w-20 overflow-hidden rounded-lg border-2 bg-border"
              style={{
                borderColor: COLOR[c.rarity],
                transform: `rotate(${(i - (cards.length - 1) / 2) * 8}deg)`,
              }}
            >
              {c.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  className="h-full w-full object-cover"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={signedIn ? "/invite" : "/login"}
        className="block w-full rounded-xl bg-cta px-5 py-3 text-center font-semibold text-black transition hover:brightness-110"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
