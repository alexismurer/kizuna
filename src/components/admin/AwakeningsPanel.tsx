"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Play, Trash2, Upload, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AwakeningCard } from "@/components/awakening/AwakeningCard";
import { AwakenReveal } from "@/components/awakening/AwakenReveal";
import {
  adminDeleteAwakening,
  adminSaveAwakening,
  type AdminAwakening,
  type AdminCardHit,
} from "@/lib/actions/admin";
import { isVideoUrl } from "@/lib/awakening/media";
import { uploadAwakeningMedia, type AwakeningMediaKind } from "@/lib/awakening/upload";
import type { AwakeningEffect } from "@/lib/rebirth/types";
import { adminErrorKey } from "./errors";
import { CardPicker } from "./Pickers";
import { AdminSection, danger, errorText, input, label, primary, row, secondary, small } from "./ui";

const EFFECTS: AwakeningEffect[] = ["none", "sun", "lightning", "flame", "void", "chains", "petals"];
const KINDS: AwakeningMediaKind[] = ["loop", "poster", "reveal"];
const FIELD: Record<AwakeningMediaKind, "loopUrl" | "posterUrl" | "revealUrl"> = {
  loop: "loopUrl",
  poster: "posterUrl",
  reveal: "revealUrl",
};
const ACCEPT: Record<AwakeningMediaKind, string> = {
  loop: "video/mp4,video/webm,image/gif",
  poster: "image/png,image/jpeg,image/webp,image/gif",
  reveal: "video/mp4,video/webm",
};
const ID = /^[a-z0-9-]{3,48}$/;
const HEX = /^#[0-9a-f]{6}$/i;

type Draft = Omit<AdminAwakening, "issued" | "baseName" | "baseImage"> & { card: AdminCardHit | null; isNew: boolean };

const blank = (): Draft => ({
  id: "",
  baseCardId: 0,
  card: null,
  title: "",
  form: "",
  effect: "none",
  accent: "#ff4d6d",
  total: 100,
  sort: 0,
  active: true,
  loopUrl: null,
  posterUrl: null,
  revealUrl: null,
  isNew: true,
});

const fromRow = (a: AdminAwakening): Draft => ({
  id: a.id,
  baseCardId: a.baseCardId,
  card: { id: a.baseCardId, number: 0, name: a.baseName, imageUrl: a.baseImage, rarity: "mythic", seriesTitle: "" },
  title: a.title,
  form: a.form,
  effect: a.effect,
  accent: a.accent,
  total: a.total,
  sort: a.sort,
  active: a.active,
  loopUrl: a.loopUrl,
  posterUrl: a.posterUrl,
  revealUrl: a.revealUrl,
  isNew: false,
});

function MediaField({
  kind,
  awakeningId,
  value,
  onChange,
}: {
  kind: AwakeningMediaKind;
  awakeningId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const te = useTranslations("admin.errors");
  const t = useTranslations("admin.awakenings");
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const badLink = !!value && !value.startsWith("https://");
  const shown = err ?? (badLink ? "invalid_link" : null);
  const name = t(`media.${kind}`);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!ID.test(awakeningId)) {
      if (file.current) file.current.value = "";
      return setErr("awakening_id");
    }
    setBusy(true);
    const r = await uploadAwakeningMedia(f, awakeningId, kind);
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!r.ok) return setErr(r.error);
    setErr(null);
    onChange(r.url);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg/40 p-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/50">{name}</span>
      <p className="text-xs text-white/40">{t(`media.${kind}Hint`)}</p>
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-black/30">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-hidden />
          ) : value ? (
            isVideoUrl(value) ? (
              <video src={value} muted loop playsInline autoPlay className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <span className="text-[10px] text-white/30">{t("media.none")}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            className={input}
            aria-label={t("media.link", { kind: name })}
            placeholder="https://"
            inputMode="url"
            value={value ?? ""}
            onChange={(e) => {
              setErr(null);
              onChange(e.target.value.trim() || null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={file}
              type="file"
              hidden
              accept={ACCEPT[kind]}
              aria-label={t("media.file", { kind: name })}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className={small}>
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {busy ? t("media.uploading") : t("media.upload")}
            </button>
            <button
              type="button"
              disabled={busy || !value}
              onClick={() => {
                setErr(null);
                onChange(null);
              }}
              className={small}
              aria-label={t("media.clearKind", { kind: name })}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden />
              {t("media.clear")}
            </button>
          </div>
          {shown && (
            <p role="alert" className="text-xs text-red-300">
              {te(adminErrorKey(shown))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AwakeningsPanel({ initial }: { initial: AdminAwakening[] }) {
  const t = useTranslations("admin.awakenings");
  const te = useTranslations("admin.errors");
  const reduce = useReducedMotion();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const open = (d: Draft) => {
    setDraft(d);
    setError(null);
  };
  const issuedOf = (id: string) => rows.find((r) => r.id === id)?.issued ?? 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.card) return setError("awakening_card");
    if (!ID.test(draft.id)) return setError("awakening_id");
    if ([draft.loopUrl, draft.posterUrl, draft.revealUrl].some((u) => u && !u.startsWith("https://"))) return setError("invalid_link");
    const { card, isNew, ...v } = draft;
    void isNew;
    start(async () => {
      const r = await adminSaveAwakening({ ...v, baseCardId: card.id });
      if (!r.ok) return setError(r.error);
      setError(null);
      const saved: AdminAwakening = {
        ...v,
        id: r.data,
        baseCardId: card.id,
        baseName: card.name,
        baseImage: card.imageUrl,
        issued: issuedOf(r.data),
      };
      setRows((cur) =>
        (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]).sort(
          (x, y) => x.sort - y.sort || x.id.localeCompare(y.id),
        ),
      );
      setDraft(null);
    });
  };

  const remove = (id: string) => {
    setConfirming(null);
    start(async () => {
      const r = await adminDeleteAwakening(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setRows((cur) => cur.filter((x) => x.id !== id));
      setDraft((d) => (d?.id === id ? null : d));
    });
  };

  const face = draft && {
    title: draft.title || "—",
    form: draft.form,
    effect: draft.effect,
    accent: HEX.test(draft.accent) ? draft.accent : "#ffffff",
    total: draft.total,
    loopUrl: draft.loopUrl ?? undefined,
    posterUrl: draft.posterUrl ?? undefined,
    revealUrl: draft.revealUrl ?? undefined,
  };

  return (
    <AdminSection
      id="awakenings"
      Icon={Wand2}
      color="var(--color-epic)"
      title={t("title")}
      description={t("description")}
      actions={
        <button type="button" onClick={() => open(blank())} className={primary}>
          {t("new")}
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {rows.map((a, i) => (
              <motion.li
                key={a.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: reduce ? 0 : Math.min(i, 8) * 0.04 }}
                className={`${row} flex min-w-0 items-center gap-3 text-sm`}
              >
                <div className="shrink-0 [&_.awk]:w-[84px]">
                  <AwakeningCard
                    awakening={{ ...a, loopUrl: a.loopUrl ?? undefined, posterUrl: a.posterUrl ?? undefined, revealUrl: a.revealUrl ?? undefined }}
                    card={{ name: a.baseName, image_url: a.baseImage }}
                    size="sm"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="break-words font-bold">{a.title}</span>
                  <span className="truncate text-xs text-white/50">
                    {a.form} · {a.baseName}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-white/70">{t("issued", { issued: a.issued, total: a.total })}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${a.active ? "bg-uncommon/15 text-uncommon" : "bg-white/[0.06] text-white/45"}`}
                    >
                      {a.active ? t("active") : t("inactive")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={pending} onClick={() => open(fromRow(a))} className={small}>
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      disabled={pending || a.issued > 0}
                      title={a.issued > 0 ? t("deleteBlocked") : undefined}
                      aria-label={confirming === a.id ? t("confirmDelete") : t("deleteName", { title: a.title })}
                      onClick={() => (confirming === a.id ? remove(a.id) : setConfirming(a.id))}
                      className={danger}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {confirming === a.id && <span className="ml-1.5">{t("confirmDelete")}</span>}
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence initial={false}>
        {draft && face && (
          <motion.form
            key="editor"
            onSubmit={save}
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden rounded-xl border border-dashed border-border"
          >
            <div className="flex flex-col gap-4 p-4">
              <h3 className="text-sm font-bold">{draft.isNew ? t("creating") : t("editing")}</h3>
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 flex-col gap-3 lg:order-1">
                  {draft.isNew || issuedOf(draft.id) === 0 ? (
                    <CardPicker value={draft.card} onChange={(c) => set({ card: c })} />
                  ) : (
                    <p className="text-xs text-white/50">{t("cardLocked", { name: draft.card?.name ?? "" })}</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={label}>
                      {t("id")}
                      <input
                        className={input}
                        value={draft.id}
                        readOnly={!draft.isNew}
                        maxLength={48}
                        onChange={(e) => set({ id: e.target.value })}
                      />
                    </label>
                    <label className={label}>
                      {t("titleLabel")}
                      <input className={input} value={draft.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
                    </label>
                    <label className={label}>
                      {t("form")}
                      <input className={input} value={draft.form} maxLength={40} onChange={(e) => set({ form: e.target.value })} />
                    </label>
                    <label className={label}>
                      {t("effect")}
                      <select
                        className={input}
                        value={draft.effect}
                        onChange={(e) => set({ effect: e.target.value as AwakeningEffect })}
                      >
                        {EFFECTS.map((f) => (
                          <option key={f} value={f}>
                            {t(`effects.${f}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={label}>
                      {t("accent")}
                      <span className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={t("accentPicker")}
                          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-bg p-1"
                          value={HEX.test(draft.accent) ? draft.accent : "#ffffff"}
                          onChange={(e) => set({ accent: e.target.value })}
                        />
                        <input className={input} value={draft.accent} maxLength={7} onChange={(e) => set({ accent: e.target.value })} />
                      </span>
                    </label>
                    <label className={label}>
                      {t("total")}
                      <input
                        className={input}
                        type="number"
                        min={1}
                        max={100000}
                        value={draft.total}
                        onChange={(e) => set({ total: Number(e.target.value) })}
                      />
                    </label>
                    <label className={label}>
                      {t("sort")}
                      <input className={input} type="number" value={draft.sort} onChange={(e) => set({ sort: Number(e.target.value) })} />
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-white/80">
                      <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
                      {t("activeLabel")}
                    </label>
                  </div>
                  {KINDS.map((k) => (
                    <MediaField
                      key={k}
                      kind={k}
                      awakeningId={draft.id}
                      value={draft[FIELD[k]]}
                      onChange={(url) => set({ [FIELD[k]]: url } as Partial<Draft>)}
                    />
                  ))}
                </div>
                <div className="flex min-w-0 flex-col items-center gap-3 lg:order-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50">{t("preview")}</span>
                  <div className="max-w-full [&_.awk]:max-w-full">
                    <AwakeningCard
                      awakening={face}
                      card={{ name: draft.card?.name ?? "—", image_url: draft.card?.imageUrl ?? null }}
                      size="lg"
                    />
                  </div>
                  <button type="button" disabled={!draft.card} onClick={() => setReveal(true)} className={secondary}>
                    <Play className="h-4 w-4" aria-hidden />
                    {t("playReveal")}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className={primary}>
                  {t("save")}
                </button>
                <button type="button" onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                  className={secondary}>
                  {t("cancel")}
                </button>
              </div>
              {error && (
                <p role="alert" className={errorText}>
                  {te(adminErrorKey(error))}
                </p>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {error && !draft && (
        <p role="alert" className={errorText}>
          {te(adminErrorKey(error))}
        </p>
      )}
      {reveal && draft?.card && face && (
        <AwakenReveal
          awakening={face}
          card={{
            number: draft.card.number,
            total: draft.total,
            name: draft.card.name,
            imageUrl: draft.card.imageUrl,
            seriesTitle: draft.card.seriesTitle,
            rarity: draft.card.rarity,
            pow: 0,
            aura: 0,
          }}
          serial={1}
          total={draft.total}
          onDone={() => setReveal(false)}
        />
      )}
    </AdminSection>
  );
}
