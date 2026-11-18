import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { CardFace } from "@/components/card/CardView";
import { createServerClient } from "@/lib/supabase/server";
import { AuthIntro } from "./AuthIntro";
import { ShowcaseFan } from "./ShowcaseFan";

type Showcase = { total: number; cards: Omit<CardFace, "total">[] };

// The catalog's three best cards, readable before sign-in (login_showcase).
async function ShowcaseArt() {
  // the client opts out of prerendering first; translations then read the request
  const supabase = await createServerClient();
  const t = await getTranslations("auth");
  const { data } = await supabase.rpc("login_showcase");
  const showcase = (data as Showcase | null) ?? { total: 0, cards: [] };
  const cards = showcase.cards.map((c) => ({ ...c, total: showcase.total }));
  return (
    <>
      <ShowcaseFan cards={cards} />
      {showcase.total > 0 && (
        <p className="relative text-sm font-semibold text-white/85">
          {t("count", { count: showcase.total })}
        </p>
      )}
    </>
  );
}

// Sign-in, invite and join pages: a booster-like art panel beside the form.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:gap-10 lg:p-8">
      <section
        className="relative flex min-h-[19rem] flex-col justify-between gap-6 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10 lg:min-h-[calc(100dvh-4rem)] lg:flex-[7]"
        style={{
          background:
            "radial-gradient(circle at 72% 62%, hsl(330 90% 60% / 0.55), transparent 48%), linear-gradient(140deg, hsl(285 65% 14%), hsl(310 75% 30%) 52%, hsl(335 85% 47%))",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ background: "repeating-linear-gradient(140deg, transparent 0 14px, rgb(255 255 255 / 0.12) 14px 16px)" }}
        />
        <AuthIntro />
        <Suspense fallback={<div className="h-56 sm:h-80" />}>
          <ShowcaseArt />
        </Suspense>
      </section>
      <div className="flex items-center lg:flex-[5]">
        <div className="w-full max-w-sm lg:mx-auto">{children}</div>
      </div>
    </main>
  );
}
