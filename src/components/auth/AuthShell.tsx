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
    <div className="flex flex-col items-center gap-4">
      <ShowcaseFan cards={cards} />
      {showcase.total > 0 && (
        <p className="relative rounded-full border border-white/10 bg-black/30 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-white/75 backdrop-blur">
          {t("count", { count: showcase.total })}
        </p>
      )}
    </div>
  );
}

// Sign-in, invite and join pages: a stage in the home hero's style, the pitch and
// the form on one side, the showcase cards on the other; `below` follows the stage.
export function AuthShell({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 p-4 sm:p-6 lg:p-8">
      <section
        className="relative grid items-center gap-8 overflow-hidden rounded-[22px] border border-[hsl(330_92%_53%/0.35)] px-6 py-8 shadow-[0_30px_80px_rgb(0_0_0/0.45)] sm:px-12 sm:py-12 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:px-16"
        style={{
          background:
            "radial-gradient(70% 70% at 78% 45%, hsl(330 92% 53% / 0.38), transparent 65%), radial-gradient(50% 60% at 0% 100%, hsl(265 85% 55% / 0.22), transparent 70%), linear-gradient(135deg, #17121e, #0e0d12 70%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/kizuna-mark-white.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[18%] -right-[10%] w-[min(70vw,620px)] opacity-[0.04]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: "repeating-linear-gradient(140deg, transparent 0 14px, rgb(255 255 255 / 0.5) 14px 15px)" }}
        />
        <div className="hero-in relative z-[1] flex min-w-0 flex-col gap-8">
          <AuthIntro />
          <div className="w-full max-w-md">{children}</div>
        </div>
        <div className="relative z-[1] -order-1 lg:order-none">
          <Suspense fallback={<div className="h-64 sm:h-96 lg:h-[32rem]" />}>
            <ShowcaseArt />
          </Suspense>
        </div>
      </section>
      {below}
    </main>
  );
}
