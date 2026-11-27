"use client";

import { useState, useTransition } from "react";
import { Crown, Skull } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { adminSaveBoss, type AdminBoss, type AdminCardHit } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { CardPicker } from "./Pickers";
import { AdminSection, errorText, input, label, okText, primary, small } from "./ui";

type Kind = "weekly" | "secret";

// This week's weekly and secret boss. Damage reaching health knocks a boss out; lowering it brings it back.
export function BossesPanel({ initial }: { initial: AdminBoss | null }) {
  const t = useTranslations("admin.bosses");
  const [boss, setBoss] = useState(initial);
  if (!boss) return <p className={errorText}>{t("unavailable")}</p>;
  return (
    <>
      <BossForm kind="weekly" boss={boss} onSaved={setBoss} />
      <BossForm kind="secret" boss={boss} onSaved={setBoss} />
    </>
  );
}

function BossForm({ kind, boss, onSaved }: { kind: Kind; boss: AdminBoss; onSaved: (b: AdminBoss) => void }) {
  const t = useTranslations("admin");
  const side = boss[kind];
  const secret = kind === "secret";
  const appeared = !secret || boss.secret.appearedAt !== null;
  // what health the secret boss gets when left automatic
  const autoSecretHp = boss.weekly.hp * 2;

  const [card, setCard] = useState<AdminCardHit | null>(side.card);
  const [hp, setHp] = useState(side.hp?.toString() ?? "");
  const [damage, setDamage] = useState(side.damage.toString());
  const [result, setResult] = useState<"ok" | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const hpNum = hp === "" ? (secret ? autoSecretHp : 0) : Number(hp);
  const shown = side.hp ?? autoSecretHp;
  const pct = Math.min(100, (side.damage / Math.max(1, shown)) * 100);
  const status = !appeared ? "hidden" : side.defeatedAt ? "down" : "standing";
  const color = secret ? "var(--color-mythic)" : "var(--color-legendary)";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await adminSaveBoss(kind, card?.id ?? null, hp === "" ? null : Number(hp), appeared ? Number(damage) : 0);
      if (r.ok) {
        onSaved(r.data);
        const next = r.data[kind];
        setCard(next.card);
        setHp(next.hp?.toString() ?? "");
        setDamage(next.damage.toString());
        setResult("ok");
      } else setResult({ error: r.error });
    });
  };

  return (
    <AdminSection
      id={`boss-${kind}`}
      Icon={secret ? Skull : Crown}
      color={color}
      title={t(`bosses.${kind}.title`)}
      description={t(`bosses.${kind}.description`, { week: boss.weekStart })}
      actions={
        <span
          className="rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
          style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color }}
        >
          {t(`bosses.status.${status}`)}
        </span>
      }
    >
      <div className="flex items-center gap-3">
        {side.card?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.card.imageUrl} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover object-top" />
        ) : (
          <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg font-bold text-white/40">?</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{side.card?.name ?? t("bosses.randomMythic")}</p>
          <p className="mt-0.5 font-mono text-sm text-white/60">
            {t("bosses.progress", { damage: side.damage, hp: shown })}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          <p className="mt-1.5 text-xs text-white/45">{t("bosses.claims", { count: side.claims })}</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CardPicker value={card} onChange={setCard} />
          {secret && <p className="mt-1 text-xs text-white/45">{t("bosses.secret.cardHint")}</p>}
        </div>
        <label className={label}>
          {t("bosses.hp")}
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000000}
            step={1}
            value={hp}
            placeholder={secret ? t("bosses.secret.autoHp", { hp: autoSecretHp }) : undefined}
            onChange={(e) => setHp(e.target.value)}
            required={!secret}
          />
          {!secret && <span className="normal-case tracking-normal text-white/40">{t("bosses.weekly.autoHp", { hp: boss.autoHp })}</span>}
        </label>
        <label className={label}>
          {t("bosses.damage")}
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={0}
            max={10000000}
            step={1}
            value={appeared ? damage : ""}
            placeholder={appeared ? undefined : t("bosses.secret.notYet")}
            onChange={(e) => setDamage(e.target.value)}
            readOnly={!appeared}
            required={appeared}
          />
          {appeared && (
            <span className="flex gap-2 normal-case tracking-normal">
              <button type="button" className={small} onClick={() => setDamage(String(hpNum))}>
                {t("bosses.knockOut")}
              </button>
              <button type="button" className={small} onClick={() => setDamage("0")}>
                {t("bosses.resetDamage")}
              </button>
            </span>
          )}
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending || (!secret && !card)} className={primary}>
            {t("bosses.save")}
          </button>
        </div>
      </form>
      {!secret && <p className="text-xs text-white/45">{t("bosses.weekly.reviveHint")}</p>}
      {result === "ok" && (
        <p role="status" className={okText}>
          {t("bosses.saved")}
        </p>
      )}
      {result && result !== "ok" && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(result.error)}`)}
        </p>
      )}
    </AdminSection>
  );
}
