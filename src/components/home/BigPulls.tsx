"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { COLOR } from "@/components/card/CardView";
import type { Rarity } from "@/lib/game/types";
import { createBrowserClient } from "@/lib/supabase/client";

const LIMIT = 12;
const POLL_MS = 30_000;

type FeedRow = { card_id: number; rarity: Rarity; username: string; pulled_at: string };
type CardRow = { id: number; name: string; image_url: string | null };
type Pull = FeedRow & { name: string; imageUrl: string | null };

function ago(iso: string, now: number, locale: string, justNow: string) {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  return rtf.format(-Math.floor(s / 86400), "day");
}

const hueOf = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

// Latest Legendary/Mythic pulls by any player, refreshed every 30 s while the tab is visible.
export function BigPulls() {
  const t = useTranslations();
  const locale = useLocale();
  const [feed, setFeed] = useState<{ pulls: Pull[]; at: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const supabase = createBrowserClient();

    async function load() {
      const { data, error } = await supabase.rpc("recent_big_pulls", { p_limit: LIMIT });
      if (error || !alive) return;
      const rows = (data ?? []) as FeedRow[];
      let cards = new Map<number, CardRow>();
      if (rows.length > 0) {
        const res = await supabase
          .from("cards")
          .select("id, name, image_url")
          .in("id", [...new Set(rows.map((r) => r.card_id))]);
        if (res.error || !alive) return;
        cards = new Map((res.data as CardRow[]).map((c) => [c.id, c]));
      }
      setFeed({
        at: Date.now(),
        pulls: rows.map((r) => ({
          ...r,
          name: cards.get(r.card_id)?.name ?? "",
          imageUrl: cards.get(r.card_id)?.image_url ?? null,
        })),
      });
    }

    const start = () => {
      void load();
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => clearInterval(timer);
    const onVisibility = () => {
      stop();
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-3 font-display text-3xl font-extrabold sm:text-4xl">
        <span className="relative flex h-3 w-3" aria-label={t("home.bigPulls.live")}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        {t("home.bigPulls.title")}
      </h2>
      {feed &&
        (feed.pulls.length === 0 ? (
          <p className="text-common">{t("home.bigPulls.empty")}</p>
        ) : (
          <ul className="flex gap-4 overflow-x-auto pb-3">
            {feed.pulls.map((p, i) => (
              <li key={`${p.pulled_at}-${i}`} className="flex w-32 shrink-0 flex-col gap-1.5">
                <div
                  className="relative aspect-[2/3] overflow-hidden rounded-xl border-2 bg-border"
                  style={{ borderColor: COLOR[p.rarity], boxShadow: `0 0 16px -4px ${COLOR[p.rarity]}` }}
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                  <span
                    className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-black"
                    style={{ background: COLOR[p.rarity] }}
                  >
                    {t(`rarity.${p.rarity}`)}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-xs font-semibold">
                    {p.name}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-sm">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
                    style={{ background: `hsl(${hueOf(p.username)} 70% 65%)` }}
                  >
                    {p.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{p.username}</span>
                </div>
                <p className="font-mono text-xs text-common">
                  {ago(p.pulled_at, feed.at, locale, t("home.bigPulls.justNow"))}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
