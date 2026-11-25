"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Coins, Gift, Images, MessagesSquare, Sparkles, Ticket, Users, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

const LOOK: Record<string, [Icon: LucideIcon, color: string]> = {
  players: [Users, "var(--color-legendary)"],
  invites: [Ticket, "var(--color-rare)"],
  currency: [Coins, "var(--color-legendary)"],
  cards: [Gift, "var(--color-epic)"],
  seasonal: [Sparkles, "var(--color-epic)"],
  pools: [CalendarDays, "var(--color-uncommon)"],
  chat: [MessagesSquare, "var(--color-accent)"],
};

// One section at a time: scrollable pill tabs on small screens, a side rail on desktop.
// Every panel stays mounted (hidden), so unsaved forms survive a tab switch.
export function StaffTabs({
  tabs,
  panels,
  navLabel,
  artLabel,
}: {
  tabs: { id: string; label: string }[];
  panels: Record<string, React.ReactNode>;
  navLabel: string;
  artLabel: string;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const bar = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [active]);

  const pick = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={navLabel} className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <ul
          ref={bar}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(({ id, label }) => {
            const [Icon, color] = LOOK[id];
            const on = id === active;
            return (
              <li key={id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => pick(id)}
                  aria-current={on}
                  className={`flex h-10 w-full items-center gap-2 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition lg:rounded-lg ${
                    on ? "text-white" : "border-border text-white/65 hover:bg-white/[0.04] hover:text-white lg:border-transparent"
                  }`}
                  style={on ? { borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
                >
                  <Icon className="h-4 w-4" style={{ color }} aria-hidden />
                  {label}
                </button>
              </li>
            );
          })}
          <li className="shrink-0 lg:mt-1 lg:shrink">
            <Link
              href="/staff/art"
              className="flex h-10 items-center gap-2 rounded-full border border-epic/40 bg-epic/10 px-3.5 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-epic/20 lg:rounded-lg"
            >
              <Images className="h-4 w-4 text-epic" aria-hidden />
              {artLabel}
            </Link>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">
        {tabs.map(({ id }) => (
          <div key={id} hidden={id !== active} className="flex min-w-0 flex-col gap-6">
            {panels[id]}
          </div>
        ))}
      </div>
    </div>
  );
}
