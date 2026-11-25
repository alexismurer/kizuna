"use client";

import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePlaySeen } from "./usePlaySeen";

// Top bar link to the game room: a glowing pill with a "New" tag until the player has been there.
export function PlayNavLink() {
  const t = useTranslations("nav");
  const seen = usePlaySeen();

  if (seen) {
    return (
      <Link href="/play" className="hover:text-accent">
        {t("play")}
      </Link>
    );
  }
  return (
    <Link
      href="/play"
      data-testid="play-new"
      className="play-new relative flex items-center gap-1.5 rounded-full border border-cta/60 bg-cta/10 px-3 py-1 font-semibold text-cta hover:bg-cta/20"
    >
      <Gamepad2 className="h-4 w-4" aria-hidden />
      {t("play")}
      <span className="rounded-full bg-accent px-1.5 text-[10px] font-extrabold uppercase leading-4 text-white">
        {t("new")}
      </span>
    </Link>
  );
}
