"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

const DEV_LOGIN = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function discord() {
    const { error } = await createBrowserClient().auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function dev(mode: "signIn" | "signUp") {
    const auth = createBrowserClient().auth;
    const { error } =
      mode === "signIn"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-panel p-6">
        <h1 className="font-display text-3xl font-extrabold">
          {t("login.title")}
        </h1>
        <button
          type="button"
          onClick={discord}
          className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-black"
        >
          {t("login.discord")}
        </button>
        {DEV_LOGIN && (
          <form
            className="space-y-3 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              dev("signIn");
            }}
          >
            <h2 className="text-sm text-common">{t("login.devHeading")}</h2>
            <input
              type="email"
              required
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
            />
            <input
              type="password"
              required
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-md bg-cta px-4 py-2 font-semibold text-black"
              >
                {t("login.signIn")}
              </button>
              <button
                type="button"
                onClick={() => dev("signUp")}
                className="flex-1 rounded-md border border-border px-4 py-2"
              >
                {t("login.signUp")}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-accent">
            {t("login.failed")}
          </p>
        )}
      </div>
    </main>
  );
}
