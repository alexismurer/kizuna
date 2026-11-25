"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Heart, ImageOff, Link2, Loader2, SkipForward, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RarityBadge } from "@/components/RarityBadge";
import {
  artAccept,
  artCandidates,
  artCards,
  artLinkCard,
  artLoadGallery,
  artPropose,
  artReject,
  artSearchMal,
  artSetImage,
  type ArtCandidate,
  type ArtCandidateFilter,
  type ArtCard,
  type ArtCardFilter,
  type ArtPage,
} from "@/lib/actions/cardArt";
import type { MalMatch } from "@/lib/mal/pictures";
import type { AdminResult } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { errorText, input, okText, primary, secondary } from "./ui";

const PAGE = 24;
const malUrl = (id: number) => `https://myanimelist.net/character/${id}`;

// ---------- shared ----------

type Loader<T, F> = (filter: F, query: string, offset: number) => Promise<AdminResult<ArtPage<T>>>;

function useQueue<T, F extends string>(load: Loader<T, F>, initial: F) {
  const [filter, setFilter] = useState<F>(initial);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ArtPage<T> | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  const reload = useCallback(
    (f: F, q: string, o: number, keepIndex = false) =>
      start(async () => {
        const r = await load(f, q, o);
        if (r.ok) {
          setPage(r.data);
          setError(null);
          if (!keepIndex) setIndex(0);
        } else setError(r.error);
      }),
    [load],
  );

  useEffect(() => {
    const id = setTimeout(() => reload(filter, query, offset), query ? 300 : 0);
    return () => clearTimeout(id);
  }, [filter, query, offset, reload]);

  const rows = page?.rows ?? [];
  // after a decision: drop the row when it leaves this filter, otherwise move on to the next one
  const done = (leaves: boolean, update?: (row: T) => T) => {
    if (!page) return;
    if (leaves) {
      const next = page.rows.filter((_, i) => i !== index);
      setPage({ total: page.total - 1, rows: next });
      if (next.length === 0) reload(filter, query, offset);
      else setIndex(Math.min(index, next.length - 1));
    } else {
      if (update) setPage({ ...page, rows: page.rows.map((r, i) => (i === index ? update(r) : r)) });
      if (index < rows.length - 1) setIndex(index + 1);
    }
  };
  const patch = (update: (row: T) => T) =>
    page && setPage({ ...page, rows: page.rows.map((r, i) => (i === index ? update(r) : r)) });

  return {
    filter,
    setFilter: (f: F) => (setFilter(f), setOffset(0)),
    query,
    setQuery: (q: string) => (setQuery(q), setOffset(0)),
    offset,
    setOffset,
    total: page?.total ?? 0,
    rows,
    index: Math.min(index, Math.max(rows.length - 1, 0)),
    setIndex,
    current: rows[Math.min(index, rows.length - 1)] as T | undefined,
    loading,
    error,
    done,
    patch,
  };
}

function Toolbar<F extends string>({
  filters,
  filter,
  onFilter,
  query,
  onQuery,
  total,
}: {
  filters: F[];
  filter: F;
  onFilter: (f: F) => void;
  query: string;
  onQuery: (q: string) => void;
  total: number;
}) {
  const t = useTranslations("admin.art");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onFilter(f)}
          aria-pressed={filter === f}
          className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
            filter === f ? "border-accent/60 bg-accent/15 text-white" : "border-border text-white/60 hover:text-white"
          }`}
        >
          {t(`filters.${f}` as "filters.all")}
        </button>
      ))}
      <input
        className={`${input} h-8 max-w-56 flex-1`}
        placeholder={t("search")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label={t("search")}
      />
      <span className="ml-auto text-xs text-white/50">{t("total", { count: total })}</span>
    </div>
  );
}

function QueueList<T>({
  rows,
  index,
  onPick,
  keyOf,
  render,
  offset,
  total,
  onOffset,
}: {
  rows: T[];
  index: number;
  onPick: (i: number) => void;
  keyOf: (r: T) => number;
  render: (r: T) => { image: string | null; title: string; sub: string; done?: boolean };
  offset: number;
  total: number;
  onOffset: (o: number) => void;
}) {
  const t = useTranslations("admin.art");
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-[34rem] flex-col gap-1 overflow-y-auto pr-1">
        {rows.map((r, i) => {
          const v = render(r);
          return (
            <li key={keyOf(r)}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === index}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition ${
                  i === index ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-white/[0.04]"
                }`}
              >
                {v.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.image} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover object-top" />
                ) : (
                  <span className="h-10 w-7 shrink-0 rounded bg-white/10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{v.title}</span>
                  <span className="block truncate text-xs text-white/50">{v.sub}</span>
                </span>
                {v.done && <Check className="h-4 w-4 shrink-0 text-uncommon" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-xs text-white/50">
        <button type="button" className={secondary + " h-8 px-2"} disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE))} aria-label={t("prev")}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span>
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} / {total}
        </span>
        <button type="button" className={secondary + " h-8 px-2"} disabled={offset + PAGE >= total} onClick={() => onOffset(offset + PAGE)} aria-label={t("next")}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

type Option = { url: string | null; tag?: string };

// arrow keys move the selection, Enter confirms (outside text fields)
function Gallery({ options, selected, onSelect, onConfirm }: { options: Option[]; selected: number; onSelect: (i: number) => void; onConfirm: () => void }) {
  const t = useTranslations("admin.art");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") onSelect(Math.min(selected + 1, options.length - 1));
      else if (e.key === "ArrowLeft") onSelect(Math.max(selected - 1, 0));
      else if (e.key === "Enter" && (!el?.closest("button") || el.closest("[data-gallery]"))) onConfirm();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options.length, selected, onSelect, onConfirm]);

  return (
    <ul data-gallery className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
      {options.map((o, i) => (
        <li key={`${o.url}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(i)}
            onDoubleClick={onConfirm}
            aria-pressed={i === selected}
            className={`relative block aspect-[5/7] w-full overflow-hidden rounded-lg border-2 bg-black/30 transition ${
              i === selected ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]" : "border-transparent hover:border-white/30"
            }`}
          >
            {o.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.url} alt={t("pictureN", { n: i + 1 })} loading="lazy" className="h-full w-full object-cover object-top" />
            ) : (
              <span className="flex h-full items-center justify-center text-white/40">
                <ImageOff className="h-5 w-5" aria-hidden />
              </span>
            )}
            {o.tag && (
              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-white/85">
                {o.tag}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function useGallery(malId: number | null, pictures: string[] | null, onLoaded: (p: string[]) => void) {
  const [failed, setFailed] = useState<{ id: number; error: string } | null>(null);
  useEffect(() => {
    if (malId === null || pictures !== null) return;
    let live = true; // moving to another character drops this answer (the gallery is stored anyway)
    artLoadGallery(malId).then((r) => {
      if (!live) return;
      if (r.ok) onLoaded(r.data);
      else setFailed({ id: malId, error: r.error });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [malId, pictures]);
  const error = failed && failed.id === malId ? failed.error : null;
  return { loading: malId !== null && pictures === null && !error, error };
}

// the picked option, reset to the first one whenever the character changes
function useSelection(key: number | undefined) {
  const [sel, setSel] = useState<{ key: number | undefined; i: number }>({ key, i: 0 });
  return [sel.key === key ? sel.i : 0, (i: number) => setSel({ key, i })] as const;
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={msg.ok ? okText : errorText}>
      {msg.text}
    </p>
  );
}

function Hints() {
  const t = useTranslations("admin.art");
  return <p className="text-xs text-white/40">{t("keys")}</p>;
}

// ---------- existing cards ----------

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-bg/60 p-3 text-sm text-white/75">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-white">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function StepTitle({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-bold text-white/85">
      {n !== undefined && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold">{n}</span>}
      {children}
    </h4>
  );
}

const isMalRef = (s: string) => /^(?:https?:\/\/(?:www\.)?myanimelist\.net\/character\/)?\d+(?:[/?#].*)?$/.test(s.trim());

// searches MAL for the card's name; clicking a result (or pasting a MAL link) links the card
function MalMatcher({ name, onLink, busy }: { name: string; onLink: (ref: string) => void; busy: boolean }) {
  const t = useTranslations("admin.art");
  const te = useTranslations("admin.errors");
  const [query, setQuery] = useState(name);
  const [result, setResult] = useState<{ q: string; matches: MalMatch[] | null; error: string | null } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || isMalRef(q)) return;
    let live = true;
    const id = setTimeout(
      () =>
        artSearchMal(q).then((r) => {
          if (live) setResult({ q, matches: r.ok ? r.data : null, error: r.ok ? null : r.error });
        }),
      q === name ? 0 : 400,
    );
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, name]);

  const q = query.trim();
  const shown = result && result.q === q ? result : null;
  const searching = q.length >= 2 && !isMalRef(q) && !shown;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg/60 p-3">
      <p className="text-sm text-white/65">{t("matchHelp")}</p>
      <div className="flex gap-2">
        <input
          className={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isMalRef(query) && onLink(query)}
          placeholder={t("matchPlaceholder")}
          aria-label={t("matchPlaceholder")}
        />
        {isMalRef(query) && (
          <button type="button" className={secondary} onClick={() => onLink(query)} disabled={busy}>
            <Link2 className="h-4 w-4" aria-hidden />
            {t("link")}
          </button>
        )}
      </div>
      {searching && (
        <p className="flex items-center gap-2 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("searching")}
        </p>
      )}
      {shown?.error && <p className={errorText}>{te(adminErrorKey(shown.error))}</p>}
      {shown?.matches?.length === 0 && <p className="text-sm text-white/55">{t("noMatches")}</p>}
      {!!shown?.matches?.length && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {shown.matches.map((m) => (
            <li key={m.malId}>
              <button
                type="button"
                onClick={() => onLink(String(m.malId))}
                disabled={busy}
                className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-black/30 text-left transition hover:border-accent/60 disabled:opacity-50"
              >
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" loading="lazy" className="aspect-[5/7] w-full object-cover object-top" />
                ) : (
                  <span className="flex aspect-[5/7] w-full items-center justify-center text-white/40">
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <span className="flex flex-col gap-0.5 p-2">
                  <span className="truncate text-sm font-semibold">{m.name}</span>
                  <span className="truncate text-xs text-white/50">{m.works[0] ?? "—"}</span>
                  <span className="flex items-center gap-1 text-xs text-white/50">
                    <Heart className="h-3 w-3" aria-hidden /> {m.favorites.toLocaleString()}
                  </span>
                  <span className="mt-1 text-xs font-bold text-accent">{t("thisOne")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardsTab() {
  const t = useTranslations("admin.art");
  const te = useTranslations("admin.errors");
  const q = useQueue<ArtCard, ArtCardFilter>(artCards, "todo");
  const card = q.current;
  const [selected, setSelected] = useSelection(card?.id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [relink, setRelink] = useState<number | null>(null); // card whose MAL match is being changed
  const [pending, start] = useTransition();
  const g = useGallery(card?.malId ?? null, card?.pictures ?? null, (pictures) => q.patch((r) => ({ ...r, pictures })));

  // current picture first, then the original (if staff changed it), then the MAL gallery
  const options: Option[] = card
    ? [
        { url: card.imageUrl, tag: t("current") },
        ...(card.originalUrl && card.originalUrl !== card.imageUrl ? [{ url: card.originalUrl, tag: t("original") }] : []),
        ...(card.pictures ?? []).filter((p) => p !== card.imageUrl && p !== card.originalUrl).map((url) => ({ url })),
      ]
    : [];

  const err = (code: string) => setMsg({ ok: false, text: te(adminErrorKey(code)) });
  const confirm = () => {
    if (!card || pending) return;
    const url = options[selected]?.url ?? null;
    start(async () => {
      const r = await artSetImage(card.id, url);
      if (!r.ok) return err(r.error);
      setMsg({ ok: true, text: t(url === card.imageUrl ? "kept" : "saved", { name: card.name }) });
      q.done(q.filter === "todo" || q.filter === "unlinked", (row) => ({
        ...row,
        imageUrl: url,
        originalUrl: row.originalUrl ?? row.imageUrl,
        reviewedAt: new Date().toISOString(),
      }));
    });
  };
  const link = (ref: string) => {
    if (!card || pending) return;
    start(async () => {
      const r = await artLinkCard(card.id, ref);
      if (!r.ok) return err(r.error);
      setRelink(null);
      setMsg({ ok: true, text: t("linked", { name: card.name }) });
      q.patch((row) => ({ ...row, malId: r.data.malId, pictures: r.data.pictures }));
    });
  };
  const matching = !!card && (card.malId === null || relink === card.id);

  return (
    <div className="flex flex-col gap-4">
      <Steps steps={[t("steps.pick"), t("steps.match"), t("steps.choose")]} />
      <Toolbar filters={["todo", "reviewed", "all"] as ArtCardFilter[]} filter={q.filter} onFilter={q.setFilter} query={q.query} onQuery={q.setQuery} total={q.total} />
      {q.error && <p className={errorText}>{te(adminErrorKey(q.error))}</p>}
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <QueueList
          rows={q.rows}
          index={q.index}
          onPick={q.setIndex}
          keyOf={(r) => r.id}
          render={(r) => ({ image: r.imageUrl, title: r.name, sub: `#${r.number} · ${r.seriesTitle}`, done: !!r.reviewedAt })}
          offset={q.offset}
          total={q.total}
          onOffset={q.setOffset}
        />
        {!card ? (
          <p className="rounded-xl border border-border bg-bg/60 p-6 text-sm text-white/55">{q.loading ? t("loading") : t("emptyCards")}</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <RarityBadge rarity={card.rarity} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-xl font-bold">{card.name}</h3>
                <p className="truncate text-sm text-white/55">
                  #{card.number} · {card.seriesTitle}
                  {card.reviewedBy && ` · ${t("reviewedBy", { name: card.reviewedBy })}`}
                </p>
              </div>
              {card.malId && (
                <a href={malUrl(card.malId)} target="_blank" rel="noreferrer" className={secondary + " h-8 text-xs"}>
                  MAL <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <StepTitle n={2}>{t("matchTitle")}</StepTitle>
              {card.malId !== null &&
                (matching ? (
                  <button type="button" className="text-xs text-white/55 underline hover:text-white" onClick={() => setRelink(null)}>
                    {t("cancel")}
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-xs text-white/55">
                    <Check className="h-3.5 w-3.5 text-uncommon" aria-hidden />
                    {t("matched")}
                    <button type="button" className="underline hover:text-white" onClick={() => setRelink(card.id)}>
                      {t("wrongMatch")}
                    </button>
                  </span>
                ))}
            </div>
            {matching && <MalMatcher key={card.id} name={card.name} onLink={link} busy={pending} />}

            <StepTitle n={3}>{t("chooseTitle")}</StepTitle>
            <p className="-mt-2 text-sm text-white/55">{card.malId === null ? t("chooseHelpUnlinked") : t("chooseHelp")}</p>
            {g.loading && (
              <p className="flex items-center gap-2 text-sm text-white/55">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("fetching")}
              </p>
            )}
            {g.error && <p className={errorText}>{te(adminErrorKey(g.error))}</p>}
            {card.pictures?.length === 0 && <p className="text-sm text-white/55">{t("noPictures")}</p>}

            <Gallery options={options} selected={selected} onSelect={setSelected} onConfirm={confirm} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} onClick={confirm} disabled={pending}>
                <Check className="h-4 w-4" aria-hidden />
                {selected === 0 ? t("keep") : t("use")}
              </button>
              <button type="button" className={secondary} onClick={() => q.done(false)} disabled={pending}>
                <SkipForward className="h-4 w-4" aria-hidden />
                {t("skip")}
              </button>
            </div>
            <Hints />
            <Status msg={msg} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- new cards ----------

function NewTab({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("admin.art");
  const te = useTranslations("admin.errors");
  const q = useQueue<ArtCandidate, ArtCandidateFilter>(artCandidates, isAdmin ? "proposed" : "new");
  const c = q.current;
  const [selected, setSelected] = useSelection(c?.malId);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const g = useGallery(c?.malId ?? null, c?.pictures ?? null, (pictures) => q.patch((r) => ({ ...r, pictures })));

  // the proposed picture (if any) first, then MAL's main picture, then the gallery
  const urls = c ? [...new Set([c.imageUrl, c.defaultUrl, ...(c.pictures ?? [])].filter((u): u is string => !!u))] : [];
  const options: Option[] = urls.map((url) => ({
    url,
    tag: c && url === c.imageUrl ? t("proposed") : c && url === c.defaultUrl ? t("main") : undefined,
  }));

  const err = (code: string) => setMsg({ ok: false, text: te(adminErrorKey(code)) });
  const url = options[selected]?.url ?? null;
  const decided = c?.status === "accepted";
  const propose = () => {
    if (!c || !url || pending || decided) return;
    start(async () => {
      const r = await artPropose(c.malId, url);
      if (!r.ok) return err(r.error);
      setMsg({ ok: true, text: t("proposedOk", { name: c.name }) });
      q.done(q.filter !== "proposed", (row) => ({ ...row, status: "proposed", imageUrl: url }));
    });
  };
  const accept = () => {
    if (!c || !url || pending || decided) return;
    start(async () => {
      const r = await artAccept(c.malId, url);
      if (!r.ok) return err(r.error);
      setMsg({ ok: true, text: t("acceptedOk", { name: c.name }) });
      q.done(true);
    });
  };
  const reject = () => {
    if (!c || pending || decided) return;
    start(async () => {
      const r = await artReject(c.malId);
      if (!r.ok) return err(r.error);
      setMsg({ ok: true, text: t("rejectedOk", { name: c.name }) });
      q.done(q.filter !== "rejected");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Toolbar filters={["new", "proposed", "rejected", "accepted"] as ArtCandidateFilter[]} filter={q.filter} onFilter={q.setFilter} query={q.query} onQuery={q.setQuery} total={q.total} />
      <p className="text-sm text-white/55">{isAdmin ? t("newHelpAdmin") : t("newHelp")}</p>
      {q.error && <p className={errorText}>{te(adminErrorKey(q.error))}</p>}
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <QueueList
          rows={q.rows}
          index={q.index}
          onPick={q.setIndex}
          keyOf={(r) => r.malId}
          render={(r) => ({ image: r.imageUrl ?? r.defaultUrl, title: r.name, sub: r.seriesTitle })}
          offset={q.offset}
          total={q.total}
          onOffset={q.setOffset}
        />
        {!c ? (
          <p className="rounded-xl border border-border bg-bg/60 p-6 text-sm text-white/55">{q.loading ? t("loading") : t("emptyNew")}</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <RarityBadge rarity={c.rarity} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-xl font-bold">
                  {c.name} {c.nativeName && <span className="text-base font-medium text-white/45">{c.nativeName}</span>}
                </h3>
                <p className="truncate text-sm text-white/55">
                  {c.seriesTitle}
                  {c.newSeries && <span className="ml-1.5 rounded bg-epic/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-epic">{t("newSeries")}</span>}
                  {" · "}
                  <Heart className="inline h-3.5 w-3.5" aria-hidden /> {c.favorites.toLocaleString()}
                  {c.proposedBy && ` · ${t("proposedBy", { name: c.proposedBy })}`}
                  {c.decidedBy && ` · ${t("decidedBy", { name: c.decidedBy })}`}
                  {c.cardNumber && ` · #${c.cardNumber}`}
                </p>
              </div>
              <a href={malUrl(c.malId)} target="_blank" rel="noreferrer" className={secondary + " h-8 text-xs"}>
                MAL <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
            {g.loading && (
              <p className="flex items-center gap-2 text-sm text-white/55">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("fetching")}
              </p>
            )}
            {g.error && <p className={errorText}>{te(adminErrorKey(g.error))}</p>}
            <Gallery options={options} selected={selected} onSelect={setSelected} onConfirm={isAdmin ? accept : propose} />
            {!decided && (
              <div className="flex flex-wrap gap-2">
                {isAdmin ? (
                  <button type="button" className={primary} onClick={accept} disabled={pending || !url}>
                    <Check className="h-4 w-4" aria-hidden />
                    {t("accept")}
                  </button>
                ) : (
                  <button type="button" className={primary} onClick={propose} disabled={pending || !url}>
                    <Check className="h-4 w-4" aria-hidden />
                    {t("propose")}
                  </button>
                )}
                {c.status !== "rejected" && (
                  <button type="button" className={secondary} onClick={reject} disabled={pending}>
                    <X className="h-4 w-4" aria-hidden />
                    {t("reject")}
                  </button>
                )}
                <button type="button" className={secondary} onClick={() => q.done(false)} disabled={pending}>
                  <SkipForward className="h-4 w-4" aria-hidden />
                  {t("skip")}
                </button>
              </div>
            )}
            <Hints />
            <Status msg={msg} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CardArtStudio({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("admin.art");
  const [tab, setTab] = useState<"cards" | "new">("cards");
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-2">
        {(["cards", "new"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`h-10 rounded-lg px-4 text-sm font-bold transition ${tab === id ? "bg-accent/15 text-white ring-1 ring-accent/50" : "text-white/60 hover:text-white"}`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === "cards" ? <CardsTab /> : <NewTab isAdmin={isAdmin} />}
    </div>
  );
}
