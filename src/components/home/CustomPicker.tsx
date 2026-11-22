"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { useRouter } from "@/i18n/navigation";
import { saveCustomSeries, type CustomOption } from "@/lib/actions/customBooster";

export const PICKS = 10;
const CREATE_COST = 250;
const EDIT_COST = 150;

// Pick exactly 10 series for the custom booster. Saving costs 250 the first
// time and 150 after; saving the same 10 is not offered.
export function CustomPicker({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: CustomOption[];
  initial: number[];
  onClose: () => void;
  // called after a successful save (the booster sheet keeps its own copy of the packs)
  onSaved?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(initial);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cost = initial.length === 0 ? CREATE_COST : EDIT_COST;
  const unchanged = picked.length === initial.length && picked.every((id) => initial.includes(id));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.title.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (id: number) => {
    if (picked.includes(id)) setPicked(picked.filter((p) => p !== id));
    else if (picked.length < PICKS) setPicked([...picked, id]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await saveCustomSeries(picked);
    setSaving(false);
    if (res.error) return setError(res.error);
    onSaved?.();
    onClose();
    router.refresh();
  };

  return (
    <Dialog label={t("home.custom.title")} title={t("home.custom.title")} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label={t("home.custom.search")}
          placeholder={t("home.custom.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-cta"
        />
        <ul className="grid max-h-[55dvh] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {shown.map((o) => {
            const on = picked.includes(o.id);
            const full = !on && picked.length >= PICKS;
            return (
              <li key={o.id}>
                <label
                  className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${on ? "border-cta bg-cta/10" : "border-border hover:border-white/30"} ${full ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(o.id)}
                    aria-label={`${o.title} ${t("home.custom.cards", { count: o.cards })}`}
                  />
                  {o.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.cover} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-12 w-9 shrink-0 rounded bg-border" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{o.title}</span>
                    <span className="block text-xs text-common">{t("home.custom.cards", { count: o.cards })}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-cta bg-cta text-black" : "border-border"}`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {error && <p className="text-sm text-red-400">{t(error)}</p>}
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-panel pt-3">
          <span className="font-mono text-sm">{t("home.custom.count", { count: picked.length })}</span>
          <button
            type="button"
            disabled={picked.length !== PICKS || unchanged || saving}
            onClick={save}
            className="ml-auto rounded-full bg-cta px-5 py-2.5 font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            {t("home.custom.confirm", { price: cost })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
