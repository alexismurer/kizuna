import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { Link } from "@/i18n/navigation";
import { LanguageSelect } from "./LanguageSelect";

const LINKS = [
  ["/", "nav.boosters"],
  ["/collection", "nav.collection"],
  ["/market", "nav.market"],
  ["/missions", "nav.missions"],
  ["/friends", "nav.friends"],
  ["/invite-friends", "nav.invite"],
  ["/rules", "footer.rules"],
  ["/rarities", "footer.rarities"],
  ["/terms", "footer.terms"],
  ["/privacy", "footer.privacy"],
] as const;

export async function Footer() {
  const t = await getTranslations();
  return (
    // the phone bottom nav covers the last 5rem of the page
    <footer className="mt-auto border-t border-border bg-panel/60 pb-24 md:pb-0">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-xl flex-col gap-2">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/kizuna-mark-white.png" alt="" aria-hidden width={28} height={28} className="h-7 w-7" />
              {APP_NAME}
            </Link>
            <p className="text-sm text-white/50">{t("footer.disclaimer")}</p>
            <p className="text-xs text-white/40">
              {t.rich("footer.credits", {
                anilist: (chunks) => (
                  <a href="https://anilist.co" target="_blank" rel="noreferrer" className="underline hover:text-white/70">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
          <LanguageSelect />
        </div>
        <nav aria-label={t("footer.label")}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
            {LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="hover:text-white">
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
