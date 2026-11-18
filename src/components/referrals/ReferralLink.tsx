"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { referralUrl } from "@/lib/referrals/link";
import { copyOrShare, shareText } from "@/lib/referrals/share";

const subscribe = () => () => {};
const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold transition hover:border-accent";

export function ReferralLink({ code, origin, share = true }: { code: string; origin?: string; share?: boolean }) {
  const t = useTranslations("referrals");
  const clientOrigin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(subscribe, () => typeof navigator.share === "function", () => false);
  const url = referralUrl(origin ?? clientOrigin, code);
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "shared" | "fallback">("idle");

  async function run(mode: "copy" | "share") {
    const result = await copyOrShare(url, shareText(t, url), mode);
    if (result === "fallback") {
      input.current?.focus();
      input.current?.select();
    }
    setState(result);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          readOnly
          value={url}
          aria-label={t("yourLink")}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 basis-56 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm"
        />
        <button type="button" onClick={() => run("copy")} className={btn}>
          <Copy size={16} aria-hidden />
          {t("copy")}
        </button>
        {share && canShare && (
          <button type="button" onClick={() => run("share")} className={btn}>
            <Share2 size={16} aria-hidden />
            {t("share")}
          </button>
        )}
      </div>
      {state === "copied" && (
        <p role="status" className="text-sm text-uncommon">
          {t("copied")}
        </p>
      )}
      {state === "fallback" && (
        <p role="status" className="text-sm text-white/60">
          {t("manualCopy")}
        </p>
      )}
    </div>
  );
}
