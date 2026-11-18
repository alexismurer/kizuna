"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminCreateInvites, adminRevokeInvite, type AdminInvite } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";

const COUNT = 5;

export function InvitesPanel({ initial }: { initial: AdminInvite[] }) {
  const t = useTranslations("admin");
  const [invites, setInvites] = useState(initial);
  const [fresh, setFresh] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      // clipboard unavailable: the code stays visible to copy by hand
    }
  };

  const create = () =>
    start(async () => {
      const r = await adminCreateInvites(COUNT);
      if (!r.ok) return setError(r.error);
      setError(null);
      setFresh(r.data);
      setInvites((cur) => [
        ...r.data.map((code) => ({ code, createdAt: new Date().toISOString(), usedBy: null, usedAt: null })),
        ...cur,
      ]);
    });

  const revoke = (code: string) =>
    start(async () => {
      const r = await adminRevokeInvite(code);
      if (!r.ok) return setError(r.error);
      setError(null);
      setInvites((cur) => cur.filter((i) => i.code !== code));
    });

  const copyButton = (code: string) => (
    <button type="button" onClick={() => copy(code)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-border">
      {copied === code ? t("invites.copied") : t("invites.copy")}
    </button>
  );

  return (
    <section id="invites" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t("invites.title")}</h2>
      <p className="text-sm text-white/70">{t("invites.hint", { path: "/invite" })}</p>
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="rounded-md bg-cta px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {t("invites.create", { count: COUNT })}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
      {invites.length === 0 ? (
        <p className="text-sm text-white/60">{t("invites.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {invites.map((i) => (
            <li
              key={i.code}
              className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 ${fresh.includes(i.code) ? "text-accent" : ""}`}
            >
              <code className="font-mono text-sm">{i.code}</code>
              <span className="min-w-0 flex-1 truncate text-sm text-white/70">
                {i.usedBy ? t("invites.usedBy", { name: i.usedBy }) : t("invites.unused")}
              </span>
              {!i.usedBy && (
                <span className="flex gap-2">
                  {copyButton(i.code)}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revoke(i.code)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-border disabled:opacity-50"
                  >
                    {t("invites.revoke")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
