import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/games", () => ({ bossClaim: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { GameRoom } from "@/components/games/GameRoom";

afterEach(cleanup);

describe("GameRoom", () => {
  const status = {
    tickets: 120,
    today: 20,
    week: 45,
    dayCap: 60,
    weekCap: 300,
    boss: { name: "Armin", imageUrl: null, rarity: "mythic", series: "AoT", hp: 400, damage: 100, mine: 45, share: 30, defeated: true, claimed: false,
      rank: 4, chance: 70, boosters: 3, gotCard: null, claimedRank: null,
      top: [{ rank: 1, name: "mikasa", damage: 300, me: false }, { rank: 4, name: "me", damage: 45, me: true }] },
    secret: { name: "Shouko", imageUrl: null, rarity: "mythic", series: "A Silent Voice", hp: 1200, damage: 200, mine: 12, share: 30, defeated: false, claimed: false,
      rank: null, chance: 0, boosters: 3, gotCard: null, claimedRank: null, top: [] },
  };

  it("leads to Duel and shows tickets, caps and the boss", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GameRoom art={["/a.png", "/b.png", "/c.png"]} status={status} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Game room" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Duel/ })).toHaveAttribute("href", "/play/duel");
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("20 / 60")).toBeInTheDocument();
    expect(screen.getByText("8 pairs")).toBeInTheDocument();
    expect(screen.getByText("BOSS OF THE WEEK")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim your reward" })).toBeInTheDocument();
    expect(screen.getByText("#4 · 70% card chance")).toBeInTheDocument();
    expect(screen.getByText("mikasa")).toBeInTheDocument();
    expect(screen.getByText("SECRET BOSS")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prize counter" })).toHaveAttribute("href", "/play/prizes");
  });

  it("ranks the secret boss like the weekly one", () => {
    const fallen = {
      ...status,
      secret: { ...status.secret, defeated: true, damage: 1200, mine: 90, rank: 2, chance: 100, top: [{ rank: 2, name: "me", damage: 90, me: true }] },
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GameRoom art={["/a.png", "/b.png", "/c.png"]} status={fallen} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("#2 · 100% card chance")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Claim your reward" })).toHaveLength(2);
    expect(screen.getAllByText("TOP 10 DAMAGE")).toHaveLength(2);
  });
});
