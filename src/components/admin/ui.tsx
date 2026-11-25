import type { LucideIcon } from "lucide-react";

// shared admin look: one card per section, one input / button style everywhere
export const input =
  "h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-white placeholder:text-white/30 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 read-only:opacity-60";
export const label = "flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50";
export const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cta px-4 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50";
export const secondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-4 text-sm font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50";
export const small =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-white/[0.03] px-2.5 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50";
export const danger =
  "inline-flex h-8 items-center justify-center rounded-md border border-red-500/30 px-2.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50";
export const row = "rounded-xl border border-border bg-bg/60 p-3.5";
export const errorText = "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300";
export const okText = "rounded-lg border border-uncommon/30 bg-uncommon/10 px-3 py-2 text-sm text-uncommon";

export function AdminSection({
  id,
  Icon,
  color,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  Icon: LucideIcon;
  color: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-white/[0.015] px-4 py-3.5 sm:px-5 sm:py-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
          {description && <p className="text-sm text-white/50">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="flex flex-col gap-4 p-3.5 sm:p-5">{children}</div>
    </section>
  );
}
