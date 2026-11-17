"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

// Above the cards of one series: its title, progress and "add the missing ones to my wishlist".
export function AlbumHeader({
  seriesId,
  title,
  owned,
  total,
  missing,
}: {
  seriesId: number;
  title: string;
  owned: number;
  total: number;
  missing: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await createBrowserClient().rpc("wishlist_add_series", { p_series_id: seriesId });
    setBusy(false);
    setMessage(error ? t(rpcErrorKey(error.message)) : t("collection.addedMissing", { count: data as number }));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-panel px-4 py-3">
      <h2 className="font-display text-xl">{title}</h2>
      <span className="font-mono text-sm text-white/50">
        {owned}/{total}
      </span>
      {missing > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="ml-auto flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-50"
        >
          <Heart aria-hidden className="h-4 w-4" />
          {t("collection.addMissing", { count: missing })}
        </button>
      )}
      {message && (
        <p role="status" className="basis-full text-sm text-accent">
          {message}
        </p>
      )}
    </div>
  );
}
