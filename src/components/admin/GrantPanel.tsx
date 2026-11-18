"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { adminGrantCurrency } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";

const input = "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm";

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
    <section id="currency" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t("grant.title")}</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("grant.username")}
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
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
        <label className="flex flex-col gap-1 text-sm">
          {t("grant.note")}
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-cta px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {t("grant.submit")}
          </button>
        </div>
      </form>
      {result && "balance" in result && (
        <p role="status" className="text-sm text-accent">
          {t("grant.success", { amount: format.number(result.amount), user: result.user, balance: format.number(result.balance) })}
        </p>
      )}
      {result && "error" in result && (
        <p role="alert" className="text-sm text-red-400">
          {t(`errors.${adminErrorKey(result.error)}`)}
        </p>
      )}
    </section>
  );
}
