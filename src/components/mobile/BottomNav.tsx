"use client";

import { useState } from "react";
import { Ellipsis, Gamepad2, House, Layers, Package, Store, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HomePack } from "@/components/home/BoosterGrid";
import { SignOutButton } from "@/components/SignOutButton";
import { Link, usePathname } from "@/i18n/navigation";
import type { Status } from "@/lib/game/types";
import { BoosterSheet } from "./BoosterSheet";
import { Sheet } from "./Sheet";

const item = "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium";

// Phone tab bar: Home, Collection, a raised Open button, Market, More.
// Hidden on md and up, and on the full-screen opening page.
export function BottomNav({
  packs,
  status,
  dailyName,
}: {
  packs: HomePack[];
  status: Status;
  dailyName: string | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"boosters" | "more" | null>(null);

  if (/^\/open\/[^/]+$/.test(pathname)) return null;

  const tab = (href: string, active: boolean, Icon: typeof House, label: string) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${item} ${active ? "text-cta" : "text-common"}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </Link>
  );
  const soon = (Icon: typeof House, label: string) => (
    <button
      type="button"
      disabled
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-common opacity-60"
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="text-xs">{t("soon")}</span>
    </button>
  );

  return (
    <>
      {/* keeps page content clear of the fixed bar */}
      <div aria-hidden className="h-20 shrink-0 md:hidden" />
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5 items-end">
          <li className="flex justify-center">{tab("/", pathname === "/", House, t("home"))}</li>
          <li className="flex justify-center">
            {tab(
              "/collection",
              pathname.startsWith("/collection") || pathname.startsWith("/card"),
              Layers,
              t("collection"),
            )}
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              aria-label={t("open")}
              aria-haspopup="dialog"
              onClick={() => setSheet("boosters")}
              className="-mt-6 mb-2 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-bg bg-cta text-black shadow-[0_8px_24px_-6px_var(--color-cta)]"
            >
              <Package className="h-6 w-6" aria-hidden />
              <span className="text-[10px] font-bold">{t("open")}</span>
            </button>
          </li>
          <li className="flex justify-center">
            <button type="button" disabled title={t("soon")} className={`${item} text-common opacity-60`}>
              <Store className="h-5 w-5" aria-hidden />
              {t("market")}
              <span className="sr-only"> · {t("soon")}</span>
            </button>
          </li>
          <li className="flex justify-center">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("more")}
              className={`${item} text-common`}
            >
              <Ellipsis className="h-5 w-5" aria-hidden />
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>

      {sheet === "boosters" && (
        <BoosterSheet
          packs={packs}
          status={status}
          dailyName={dailyName}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "more" && (
        <Sheet label={t("moreTitle")} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-1">
            {soon(Gamepad2, t("play"))}
            {soon(Target, t("missions"))}
            <div className="mt-2 overflow-hidden rounded-xl border border-border">
              <SignOutButton />
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
