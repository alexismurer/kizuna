"use client";

import { useState, useTransition } from "react";
import { Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { adminGrantCurrency } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { AdminSection, errorText, input, label, okText, primary } from "./ui";

export function GrantPanel() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ balance: number; user: string; amount: number } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const n = Number(amount);
      const r = await adminGrantCurrency(username, n, note.trim() || null);
      if (r.ok) {
        setResult({ balance: r.data, user: username.trim(), amount: n });
        setAmount("");
        setNote("");
      } else setResult({ error: r.error });
    });
  };

  return (
    <AdminSection id="currency" Icon={Coins} color="var(--color-legendary)" title={t("grant.title")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          {t("grant.username")}
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
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
          <button type="submit" disabled={pending} className={primary}>
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
