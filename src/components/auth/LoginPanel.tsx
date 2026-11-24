"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

const DISCORD_PATH =
  "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z";

const GOOGLE_PATHS = [
  ["#4285F4", "M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"],
  ["#34A853", "M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"],
  ["#FBBC05", "M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"],
  ["#EA4335", "M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"],
];

const field = "w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus-visible:border-accent";

export function LoginPanel({ devLogin }: { devLogin: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signIn(provider: "discord" | "google") {
    setBusy(true);
    const next = new URLSearchParams(window.location.search).get("next");
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    const { error } = await createBrowserClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setError(true);
      setBusy(false);
    }
  }

  async function dev(mode: "signIn" | "signUp") {
    const auth = createBrowserClient().auth;
    const { error } =
      mode === "signIn"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    if (error) return setError(true);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-extrabold text-white">{t("login.title")}</h1>
        <p className="text-sm text-white/60">{t("login.newHere")}</p>
      </div>
      <button
        type="button"
        onClick={() => signIn("discord")}
        disabled={busy}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#5865F2] px-7 font-display text-base font-bold text-white shadow-[0_0_40px_rgb(88_101_242/0.45)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
          <path d={DISCORD_PATH} />
        </svg>
        {t("login.discord")}
      </button>
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={busy}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-white px-7 font-display text-base font-bold text-[#1f1f1f] transition hover:-translate-y-0.5 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          {GOOGLE_PATHS.map(([fill, d]) => (
            <path key={fill} fill={fill} d={d} />
          ))}
        </svg>
        {t("login.google")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {t("login.failed")}
        </p>
      )}
      <p className="text-xs text-white/40">{t("login.credits")}</p>
      {devLogin && (
        <details className="group rounded-xl border border-border bg-panel p-4">
          <summary className="cursor-pointer text-sm text-common">{t("login.devHeading")}</summary>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              dev("signIn");
            }}
          >
            <input
              type="email"
              required
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
            <input
              type="password"
              required
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-lg bg-cta px-4 py-2 font-semibold text-black">
                {t("login.signIn")}
              </button>
              <button
                type="button"
                onClick={() => dev("signUp")}
                className="flex-1 rounded-lg border border-border px-4 py-2"
              >
                {t("login.signUp")}
              </button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
