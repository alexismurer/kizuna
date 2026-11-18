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
  // the code is optional: shown on request, or when a referral is replaced or refused
  const [useCode, setUseCode] = useState(initialError !== null);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createBrowserClient().rpc("redeem_invite", {
      p_code: useCode ? code.trim() : (referral?.code ?? ""),
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-4xl font-extrabold">
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
      <input
        required
        minLength={3}
        maxLength={20}
        placeholder={t("invite.username")}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus-visible:border-accent"
      />
      <p className="text-xs text-common">{t("invite.hint")}</p>
      {useCode && (
        <input
          placeholder={t("invite.code")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus-visible:border-accent font-mono"
        />
      )}
      {!referral && !useCode && (
        <button
          type="button"
          onClick={() => setUseCode(true)}
          className="self-start text-sm text-accent underline"
        >
          {t("invite.haveCode")}
        </button>
      )}
      <button
        type="submit"
        className="w-full rounded-xl bg-cta px-5 py-3 font-semibold text-black transition hover:brightness-110"
      >
        {t("invite.submit")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {t(error)}
        </p>
      )}
    </form>
  );
}
