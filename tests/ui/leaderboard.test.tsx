import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { Podium } from "@/components/leaderboard/Podium";
import { parseTab, parseTier } from "@/lib/leaderboardParams";
import type { LeaderboardRow } from "@/lib/rebirth/types";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const row = (rank: number, username: string, value: number): LeaderboardRow => ({
  rank,
  username,
  avatar: null,
  tier: rank === 1 ? 2 : 0,
  renown: value,
  value,
});

describe("Podium", () => {
  it("puts rank 1 in the middle, rank 2 on the left and rank 3 on the right", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <Podium rows={[row(1, "alpha", 900), row(2, "bravo", 500), row(3, "charlie", 100)]} tab="renown" />
      </NextIntlClientProvider>,
    );
    const places = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(places).toHaveLength(3);
    expect(places[0]).toHaveTextContent("bravo");
    expect(places[1]).toHaveTextContent("alpha");
    expect(places[2]).toHaveTextContent("charlie");
  });

  it("shows only the places that exist", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <Podium rows={[row(1, "alpha", 900)]} tab="renown" />
      </NextIntlClientProvider>,
    );
    const places = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(places).toHaveLength(1);
    expect(places[0]).toHaveTextContent("alpha");
  });
});

describe("leaderboard params", () => {
  it("falls back to renown for an unknown or missing tab", () => {
    expect(parseTab("mythics")).toBe("mythics");
    expect(parseTab("series")).toBe("renown");
    expect(parseTab(undefined)).toBe("renown");
    expect(parseTab(["collection", "x"])).toBe("collection");
  });

  it("keeps a tier only on the renown tab and only when it is a whole number", () => {
    expect(parseTier("renown", "2")).toBe(2);
    expect(parseTier("renown", "0")).toBe(0);
    expect(parseTier("renown", "abc")).toBeNull();
    expect(parseTier("renown", "-1")).toBeNull();
    expect(parseTier("renown", "1.5")).toBeNull();
    expect(parseTier("collection", "2")).toBeNull();
    expect(parseTier("renown", undefined)).toBeNull();
  });
});
