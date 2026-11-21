"use client";

import { useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { adminGrantCard, type AdminCardHit, type AdminPlayerHit } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { CardPicker, PlayerPicker } from "./Pickers";
import { AdminSection, errorText, input, label, okText, primary } from "./ui";

export function GrantCardPanel() {
  const t = useTranslations("admin");
  const [player, setPlayer] = useState<AdminPlayerHit | null>(null);
  const [card, setCard] = useState<AdminCardHit | null>(null);
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ owned: number; user: string; card: string; count: number } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || !card) return;
    start(async () => {
      const n = Number(count);
      const r = await adminGrantCard(player.username, card.id, n, note.trim() || null);
      if (r.ok) {
        setResult({ owned: r.data, user: player.username, card: card.name, count: n });
        setNote("");
      } else setResult({ error: r.error });
    });
  };

  return (
    <AdminSection id="cards" Icon={Gift} color="var(--color-epic)" title={t("grantCard.title")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <PlayerPicker value={player} onChange={setPlayer} />
        <CardPicker value={card} onChange={setCard} />
        <label className={label}>
          {t("grantCard.count")}
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            required
          />
        </label>
        <label className={label}>
          {t("grant.note")}
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending || !player || !card} className={primary}>
            {t("grantCard.submit")}
          </button>
        </div>
      </form>
      {result && "owned" in result && (
        <p role="status" className={okText}>
          {t("grantCard.success", result)}
        </p>
      )}
      {result && "error" in result && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(result.error)}`)}
        </p>
      )}
    </AdminSection>
  );
}
