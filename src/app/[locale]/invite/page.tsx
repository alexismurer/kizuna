"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { createBrowserClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const t = useTranslations();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createBrowserClient().rpc("redeem_invite", {
      p_code: code.trim(),
      p_username: username.trim(),
    });
    if (error) return setError(rpcErrorKey(error.message));
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-panel p-6"
      >
        <h1 className="font-display text-3xl font-extrabold">
          {t("invite.title")}
        </h1>
        <input
          required
          placeholder={t("invite.code")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono"
        />
        <input
          required
          minLength={3}
          maxLength={20}
          placeholder={t("invite.username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2"
        />
        <p className="text-xs text-common">{t("invite.hint")}</p>
        <button
          type="submit"
          className="w-full rounded-md bg-cta px-4 py-2 font-semibold text-black"
        >
          {t("invite.submit")}
        </button>
        {error && (
          <p role="alert" className="text-sm text-accent">
            {t(error)}
          </p>
        )}
      </form>
    </main>
  );
}
