"use client";

import { useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { adminCreateInvites, adminRevokeInvite, type AdminInvite } from "@/lib/actions/admin";
import { adminErrorKey } from "./errors";
import { AdminSection, danger, errorText, primary, small } from "./ui";

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
    <button type="button" onClick={() => copy(code)} className={small}>
      {copied === code ? t("invites.copied") : t("invites.copy")}
    </button>
  );

  return (
    <AdminSection
      id="invites"
      Icon={Ticket}
      color="var(--color-rare)"
      title={t("invites.title")}
      description={t("invites.hint", { path: "/invite" })}
      actions={
        <button type="button" disabled={pending} onClick={create} className={primary}>
          {t("invites.create", { count: COUNT })}
        </button>
      }
    >
      {error && (
        <p role="alert" className={errorText}>
          {t(`errors.${adminErrorKey(error)}`)}
        </p>
      )}
      {invites.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">{t("invites.empty")}</p>
      ) : (
        <ul className="flex max-h-[26rem] flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-bg/60">
          {invites.map((i) => (
            <li
              key={i.code}
              className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 ${fresh.includes(i.code) ? "bg-accent/[0.06]" : ""}`}
            >
              <code className={`rounded-md bg-white/[0.05] px-2 py-1 font-mono text-sm tracking-wider ${fresh.includes(i.code) ? "text-accent" : ""}`}>{i.code}</code>
              <span className="min-w-0 flex-1 truncate text-sm">
                {i.usedBy ? (
                  <span className="text-white/50">{t("invites.usedBy", { name: i.usedBy })}</span>
                ) : (
                  <span className="rounded-full bg-uncommon/15 px-2 py-0.5 text-xs font-semibold text-uncommon">{t("invites.unused")}</span>
                )}
              </span>
              {!i.usedBy && (
                <span className="flex gap-2">
                  {copyButton(i.code)}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revoke(i.code)}
                    className={danger}
                  >
                    {t("invites.revoke")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
