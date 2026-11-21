"use client";

import { useState, useTransition } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { adminGrantCurrency, type AdminPlayerHit } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { PlayerPicker } from "./Pickers";
import { AdminSection, errorText, input, label, okText, primary } from "./ui";

export function GrantPanel() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [player, setPlayer] = useState<AdminPlayerHit | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ balance: number; user: string; amount: number } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!player) return;
    start(async () => {
      const n = Number(amount);
      const r = await adminGrantCurrency(player.username, n, note.trim() || null);
      if (r.ok) {
        setResult({ balance: r.data, user: player.username, amount: n });
        setAmount("");
        setNote("");
      } else setResult({ error: r.error });
    });
  };

  return (
    <AdminSection id="currency" Icon={Coins} color="var(--color-legendary)" title={t("grant.title")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <PlayerPicker value={player} onChange={setPlayer} />
        <label className={label}>
          {t("grant.amount")}
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label className={`${label} sm:col-span-2`}>
          {t("grant.note")}
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending || !player} className={primary}>
            {t("grant.submit")}
          </button>
        </div>
      </form>
      {result && "balance" in result && (
        <p role="status" className={okText}>
          {t("grant.success", { amount: format.number(result.amount), user: result.user, balance: format.number(result.balance) })}
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
