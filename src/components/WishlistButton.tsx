"use client";

import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

// Heart toggle: flips at once, rolls back if the server refuses.
// `primary` + `label` (text when off / on) give the wiki page's filled call-to-action look.
export function WishlistButton({
  cardId,
  initial,
  label,
  primary = false,
}: {
  cardId: number;
  initial: boolean;
  label?: { off: string; on: string };
  primary?: boolean;
}) {
  const t = useTranslations();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busyRef.current) return;
    busyRef.current = true;
    const before = on;
    setOn(!before);
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await createBrowserClient().rpc("toggle_wishlist", {
        p_card_id: cardId,
      });
      if (rpcError) {
        setOn(before);
        setError(rpcErrorKey(rpcError.message));
      } else {
        setOn(data as boolean);
      }
    } catch {
      setOn(before);
      setError("errors.unknown");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-pressed={on}
        disabled={busy}
        onClick={toggle}
        className={`flex items-center justify-center gap-2 border text-sm ${primary ? "w-full rounded-lg px-4 py-2 font-bold" : "rounded-full px-4 py-1.5"} ${on ? "border-accent text-accent" : primary ? "border-cta bg-cta text-black" : "border-border"} disabled:opacity-60`}
      >
        <Heart className="h-4 w-4" aria-hidden fill={on ? "currentColor" : "none"} />
        {label ? (on ? label.on : label.off) : t("wishlist.button")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {t(error)}
        </p>
      )}
    </div>
  );
}
