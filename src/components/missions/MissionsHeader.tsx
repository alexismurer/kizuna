import { Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

// The hero card: eyebrow, title and subtitle, with an action (Claim all) on the right.
export function MissionsHeader({ action }: { action?: React.ReactNode }) {
  const t = useTranslations("missions");
  return (
    <header className="relative overflow-hidden rounded-3xl border border-border bg-panel p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_50%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%),radial-gradient(50%_90%_at_0%_100%,color-mix(in_srgb,var(--color-cta)_10%,transparent),transparent_70%)]"
      />
      <Trophy
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-6 h-56 w-56 -rotate-12 text-legendary/[0.07]"
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-accent">{t("eyebrow")}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-common sm:text-base">{t("subtitle")}</p>
        </div>
        {action}
      </div>
    </header>
  );
}
