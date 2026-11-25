"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { referralUrl } from "@/lib/referrals/link";
import { copyOrShare, shareText } from "@/lib/referrals/share";

const subscribe = () => () => {};
const btn =
  "inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-bold transition hover:-translate-y-0.5";

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
    setState(result === "cancelled" ? "idle" : result);
  }

  const copied = state === "copied";
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <input
            ref={input}
            readOnly
            value={url}
            aria-label={t("yourLink")}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 basis-56 rounded-full border border-border bg-bg px-5 py-3 font-mono text-sm outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={() => run("copy")}
            className={`${btn} ${copied ? "border-uncommon bg-uncommon/15 text-uncommon" : "border-accent bg-accent text-black"}`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ scale: 0.4, rotate: -40, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex"
              >
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              </motion.span>
            </AnimatePresence>
            {t("copy")}
          </button>
          {share && canShare && (
            <button type="button" onClick={() => run("share")} className={`${btn} border-border bg-bg/60 hover:border-accent`}>
              <Share2 size={16} aria-hidden />
              {t("share")}
            </button>
          )}
        </div>
        {copied && (
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
    </MotionConfig>
  );
}
