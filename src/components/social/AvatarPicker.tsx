"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { Dialog } from "@/components/market/Dialog";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { matchesCard } from "@/lib/social/format";
import type { ProfileCard } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";

export function AvatarPicker({ owned, total, onClose }: { owned: ProfileCard[]; total: number; onClose: () => void }) {
  const t = useTranslations("profile");
  const te = useTranslations();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const shown = owned.filter((c) => matchesCard(c, q));

  async function choose(cardId: number | null) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("set_avatar", { p_card_id: cardId });
      if (rpcError) setError(rpcErrorKey(rpcError.message));
      else {
        router.refresh();
        onClose();
      }
    } catch {
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog label={t("avatarTitle")} onClose={onClose} wide>
      <h2 className="mb-3 pr-10 font-display text-xl">{t("avatarTitle")}</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("searchCards")}
          placeholder={t("searchCards")}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(null)}
          className="rounded-full border border-border px-4 py-1.5 text-sm"
        >
          {t("defaultAvatar")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-accent">
          {te(error)}
        </p>
      )}
      {owned.length === 0 ? (
        <p className="text-common">{t("noCards")}</p>
      ) : shown.length === 0 ? (
        <p className="text-common">{t("noMatches")}</p>
      ) : (
        <div
          role="group"
          aria-label={t("yourCards")}
          className="grid grid-cols-3 justify-items-center gap-2 sm:grid-cols-4 md:grid-cols-5"
        >
          {shown.map((c) => (
            <button key={c.id} type="button" aria-label={c.name} disabled={busy} onClick={() => choose(c.id)} className="rounded-xl">
              <CardView card={{ ...c, total }} size="xs" glow={false} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
