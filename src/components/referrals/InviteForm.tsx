"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { rpcErrorKey } from "@/lib/game/errors";
import { REF_COOKIE } from "@/lib/referrals/link";
import { createBrowserClient } from "@/lib/supabase/client";

export function InviteForm({
  referral,
  initialError = null,
}: {
  referral: { code: string; username: string } | null;
  initialError?: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [useCode, setUseCode] = useState(referral === null);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createBrowserClient().rpc("redeem_invite", {
      p_code: useCode ? code.trim() : referral!.code,
      p_username: username.trim(),
    });
    if (error) {
      const key = rpcErrorKey(error.message);
      if (key === "errors.invalid_invite") setUseCode(true);
      return setError(key);
    }
    document.cookie = `${REF_COOKIE}=; max-age=0; path=/`;
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
        {referral && !useCode && (
          <p className="text-sm">
            {t("invite.invitedBy", { name: referral.username })}{" "}
            <button
              type="button"
              onClick={() => setUseCode(true)}
              className="text-accent underline"
            >
              {t("invite.useAnother")}
            </button>
          </p>
        )}
        {useCode && (
          <input
            required
            placeholder={t("invite.code")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono"
          />
        )}
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
