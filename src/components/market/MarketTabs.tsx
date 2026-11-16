import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { marketHref, parseMarketParams } from "@/lib/market/filters";
import { MARKET_TABS, type MarketTab } from "@/lib/market/types";

export function MarketTabs({ active }: { active: MarketTab }) {
  const t = useTranslations("market.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-5 border-b border-border">
        {MARKET_TABS.map((tab) => (
          <li key={tab}>
            <Link
              href={marketHref({ ...parseMarketParams({}), tab })}
              aria-current={tab === active ? "page" : undefined}
              className={`-mb-px block border-b-2 pb-2 pt-1 text-sm font-bold ${tab === active ? "border-cta text-cta" : "border-transparent text-common hover:text-white"}`}
            >
              {t(tab)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
