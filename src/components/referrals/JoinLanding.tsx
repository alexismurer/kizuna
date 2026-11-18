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
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-panel p-6 text-center">
          <h1 className="font-display text-2xl font-extrabold">{t("broken")}</h1>
          <p className="text-sm text-common">{t("brokenHint")}</p>
        </div>
      </main>
    );
  }
  const cards = preview.cards.slice(0, 3);
  return (
    <main data-code={code} className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-panel p-6 text-center">
        <div className="flex justify-center">
          <Avatar url={preview.avatarUrl} username={preview.username} size={72} />
        </div>
        <h1 className="break-words font-display text-2xl font-extrabold">
          {t("invited", { name: preview.username })}
        </h1>
        {cards.length > 0 && (
          <ul className="flex justify-center -space-x-4" aria-label={t("cards")}>
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
                  <img src={c.imageUrl} alt={c.name} className="h-full w-full object-cover" />
                )}
              </li>
            ))}
          </ul>
        )}
        <Link
          href={signedIn ? "/invite" : "/login"}
          className="block w-full rounded-md bg-cta px-4 py-2 font-semibold text-black"
        >
          {t("cta")}
        </Link>
      </div>
    </main>
  );
}
