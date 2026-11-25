"use client";

import { useId, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/market/Dialog";
import { useRouter } from "@/i18n/navigation";
import { saveCustomSeries, type CustomOption } from "@/lib/actions/customBooster";

export const PICKS = 10;
const CREATE_COST = 500;
const EDIT_COST = 150;
const SUGGESTED = 50;
const MATCHES = 8;

function Cover({ src, className }: { src: string | null; className: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={`${className} shrink-0 rounded object-cover`} />
  ) : (
    <span className={`${className} shrink-0 rounded bg-border`} />
  );
}

// Pick exactly 10 series for the custom booster: the 50 most popular are
// suggested (options arrive most popular first), any other one is found by
// typing its name. Creating costs 500 (also again once the week is over, with
// the last picks pre-ticked); editing a live booster costs 150, and saving the
// same 10 then is not offered.
export function CustomPicker({
  options,
  initial,
  live,
  onClose,
  onSaved,
}: {
  options: CustomOption[];
  initial: number[];
  // the booster is live: saving is an edit
  live: boolean;
  onClose: () => void;
  // called after a successful save (the booster sheet keeps its own copy of the packs)
  onSaved?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const listId = useId();
  const [picked, setPicked] = useState<number[]>(initial);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const suggested = options.slice(0, SUGGESTED);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? options.filter((o) => o.title.toLowerCase().includes(q)).slice(0, MATCHES) : []),
    [options, q],
  );
  const cost = live ? EDIT_COST : CREATE_COST;
  const unchanged = live && picked.length === initial.length && picked.every((id) => initial.includes(id));
  const full = picked.length >= PICKS;

  const toggle = (id: number) => {
    if (picked.includes(id)) setPicked(picked.filter((p) => p !== id));
    else if (!full) setPicked([...picked, id]);
  };
  const choose = (o: CustomOption) => {
    if (!picked.includes(o.id) && full) return;
    toggle(o.id);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((active + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((active - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(matches[Math.min(active, matches.length - 1)]);
    }
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
      <div className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="search"
            role="combobox"
            aria-expanded={q !== ""}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
            aria-label={t("home.custom.search")}
            placeholder={t("home.custom.search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-cta"
          />
          {q !== "" && (
            <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-panel shadow-[0_20px_40px_rgb(0_0_0/0.6)]">
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-common">{t("home.custom.noMatch")}</p>
              ) : (
                <ul id={listId} role="listbox" aria-label={t("home.custom.search")}>
                  {matches.map((o, i) => {
                    const on = picked.includes(o.id);
                    return (
                      <li
                        key={o.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={on}
                        aria-disabled={!on && full}
                        onMouseEnter={() => setActive(i)}
                        // keep focus in the search box
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(o)}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-white/5" : ""} ${!on && full ? "opacity-50" : ""}`}
                      >
                        <Cover src={o.cover} className="h-10 w-7" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{o.title}</span>
                        {on && <Check className="h-4 w-4 text-cta" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {picked.length > 0 && (
          <section
            aria-label={t("home.custom.picks")}
            className="flex flex-wrap justify-center gap-1.5"
          >
            {picked.map((id) => {
              const o = byId.get(id);
              if (!o) return null;
              return (
                <span
                  key={id}
                  className="flex min-w-0 basis-[calc((100%-0.375rem)/2)] items-center gap-1.5 rounded-full border border-cta sm:basis-[calc((100%-0.75rem)/3)] bg-cta/10 py-1 pl-1 pr-1.5 text-xs font-semibold"
                >
                  <Cover src={o.cover} className="h-6 w-6 rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  <button
                    type="button"
                    aria-label={t("home.custom.remove", { title: o.title })}
                    onClick={() => toggle(id)}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              );
            })}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-common">
            {t("home.custom.popular")}
          </h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {suggested.map((o) => {
              const on = picked.includes(o.id);
              const off = !on && full;
              return (
                <li key={o.id}>
                  <label
                    className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-2 ${on ? "border-cta bg-cta/10" : "border-border hover:border-white/30"} ${off ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => toggle(o.id)}
                      aria-label={`${o.title} ${t("home.custom.cards", { count: o.cards })}`}
                    />
                    <Cover src={o.cover} className="h-12 w-9" />
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
        </section>

        {error && <p className="text-sm text-red-400">{t(error)}</p>}
        <div className="sticky bottom-0 -mb-5 flex items-center gap-3 border-t border-border bg-panel py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
