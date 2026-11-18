"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { CardView } from "@/components/card/CardView";
import { Dialog } from "@/components/market/Dialog";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { matchesCard } from "@/lib/social/format";
import type { ProfileCard } from "@/lib/social/types";
import { createBrowserClient } from "@/lib/supabase/client";

const MAX = 8;

// Tap a card to add or remove it; arrows set the order; Save sends the ordered ids.
export function ShowcasePicker({
  owned,
  initial,
  total = 0,
  onClose,
}: {
  owned: ProfileCard[];
  initial: number[];
  total?: number;
  onClose: () => void;
}) {
  const t = useTranslations("profile");
  const te = useTranslations();
  const router = useRouter();
  const byId = new Map(owned.map((c) => [c.id, c]));
  const [ids, setIds] = useState(() => initial.filter((id) => byId.has(id)).slice(0, MAX));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const shown = owned.filter((c) => matchesCard(c, q));

  const toggle = (id: number) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX ? [...cur, id] : cur));
  const move = (i: number, d: number) =>
    setIds((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  async function save() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await createBrowserClient().rpc("set_showcase", { p_card_ids: ids });
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

  const arrow = "flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-30";
  return (
    <Dialog label={t("showcaseTitle")} onClose={onClose} wide>
      <h2 className="mb-3 pr-10 font-display text-xl">
        {t("showcaseTitle")}{" "}
        <span className="text-sm text-common">
          {ids.length}/{MAX}
        </span>
      </h2>
      <div className="mb-4 rounded-xl border border-border p-3">
        <h3 className="mb-2 text-xs uppercase tracking-widest text-common">{t("chosen")}</h3>
        {ids.length === 0 ? (
          <p className="text-sm text-common">{t("noneChosen")}</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {ids.map((id, i) => {
              const c = byId.get(id)!;
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-common">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <button
                    type="button"
                    aria-label={t("moveUp", { name: c.name })}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className={arrow}
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown", { name: c.name })}
                    disabled={i === ids.length - 1}
                    onClick={() => move(i, 1)}
                    className={arrow}
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" aria-label={t("removeCard", { name: c.name })} onClick={() => toggle(id)} className={arrow}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("searchCards")}
        placeholder={t("searchCards")}
        className="mb-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
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
          {shown.map((c) => {
            const on = ids.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={on}
                disabled={!on && ids.length >= MAX}
                onClick={() => toggle(c.id)}
                className={`rounded-xl disabled:opacity-40 ${on ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
              >
                <CardView card={{ ...c, total }} size="xs" glow={false} />
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {te(error)}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-full bg-cta px-6 py-2 text-sm font-bold text-black disabled:opacity-60"
        >
          {t("save")}
        </button>
      </div>
    </Dialog>
  );
}
