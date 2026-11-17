import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AchievementGrid } from "@/components/missions/AchievementGrid";
import { MissionList } from "@/components/missions/MissionList";
import { MissionsContent } from "@/components/missions/MissionsContent";
import { StreakPanel } from "@/components/missions/StreakPanel";
import { SummaryChips } from "@/components/missions/SummaryChips";
import type { MissionItem, MissionsData, StreakState } from "@/lib/game/missions";
import messages from "../../messages/en.json";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

const serverRpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc: (...a: unknown[]) => serverRpc(...a) }),
}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return { getTranslations: async (namespace: "missions") => createTranslator({ locale: "en", messages, namespace }) };
});

const item = (key: string, progress: number, target: number, claimed = false, reward = 20): MissionItem => ({
  key,
  target,
  reward,
  progress,
  claimed,
});

const streak = (o: Partial<StreakState> = {}): StreakState => ({
  day: 3,
  claimedToday: true,
  rewards: [20, 30, 40, 50, 60, 80, 100],
  forgivenThisWeek: false,
  loginsTotal: 12,
  ...o,
});

const data: MissionsData = {
  day: "2026-11-15",
  weekStart: "2026-11-09",
  dailyResetAt: "2026-11-15T23:00:00+00:00",
  weeklyResetAt: "2026-11-15T23:00:00+00:00",
  streak: streak(),
  first: [
    item("first_booster", 1, 1, true),
    item("first_recycle", 1, 1, true),
    item("first_wishlist", 3, 3),
    item("first_page", 0, 1),
    item("first_username", 1, 1, true, 30),
    item("first_discord", 0, 1, false, 150),
  ],
  daily: [item("daily_pages", 3, 3), item("daily_open", 2, 5), item("daily_rare", 3, 3, true)],
  weekly: [item("weekly_legendary", 0, 1, false, 150), item("weekly_mythic", 0, 1, false, 250), item("weekly_series", 0, 1, false, 200)],
  achievements: [
    item("ach_open_10", 10, 10, true, 10),
    item("ach_open_100", 71, 100, false, 50),
    item("ach_own_50", 50, 50, false, 20),
  ],
  bonuses: {
    first: { claimed: false, earned: false },
    daily: { claimed: false, earned: false },
    weekly: { claimed: false, earned: false },
  },
  claimable: 3,
};

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Paris">
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  refresh.mockReset();
});

describe("SummaryChips", () => {
  it("renders the five section chips with their counts", () => {
    wrap(<SummaryChips data={data} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Login 3/7",
      "First steps 3/6",
      "Daily 1/3",
      "Weekly 0/3",
      "Achievements 1/3",
    ]);
    expect(links[4].getAttribute("href")).toBe("#achievements");
  });
});

describe("StreakPanel", () => {
  it("ticks claimed days, highlights today and notes the golden day 7", () => {
    wrap(<StreakPanel streak={streak()} />);
    const tiles = screen.getAllByRole("listitem");
    expect(tiles).toHaveLength(7);
    expect(tiles.map((t) => t.getAttribute("data-state"))).toEqual([
      "claimed",
      "claimed",
      "today",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(within(tiles[6]).getByText("100")).toBeTruthy();
    expect(screen.getByText("Day 7: next booster is golden")).toBeTruthy();
    expect(screen.getByText(/12 logins in total · 1 missed day allowed this week/)).toBeTruthy();
  });

  it("marks the next day as today before the login is claimed", () => {
    wrap(<StreakPanel streak={streak({ day: 2, claimedToday: false, forgivenThisWeek: true })} />);
    const states = screen.getAllByRole("listitem").map((t) => t.getAttribute("data-state"));
    expect(states.slice(0, 4)).toEqual(["claimed", "claimed", "today", "upcoming"]);
    expect(screen.getByText(/missed day used this week/)).toBeTruthy();
  });
});

describe("MissionList", () => {
  it("shows Claim, In progress and Claimed states", () => {
    wrap(<MissionList section="daily" items={data.daily!} bonus={data.bonuses.daily} resetAt={data.dailyResetAt} />);
    expect(screen.getByText("View 3 character pages")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Claim" })).toHaveLength(1);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText(/Claimed/)).toBeTruthy();
    expect(screen.getByText("All 3 claimed → +1 bonus booster")).toBeTruthy();
  });

  it("claims once even on a double click, then refreshes", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    wrap(<MissionList section="daily" items={data.daily!} bonus={data.bonuses.daily} resetAt={data.dailyResetAt} />);
    const btn = screen.getByRole("button", { name: "Claim" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("claim_mission", { p_key: "daily_pages" });
    await act(async () => resolve({ data: { currency: 120, granted: null }, error: null }));
    expect(btn.textContent).toBe("+20");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the error text when a claim fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_complete" } });
    wrap(<MissionList section="daily" items={data.daily!} bonus={data.bonuses.daily} resetAt={data.dailyResetAt} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Claim" })));
    expect(screen.getByRole("alert").textContent).toBe("This mission is not complete yet.");
  });
});

describe("AchievementGrid", () => {
  it("switches lists with the filter", () => {
    wrap(<AchievementGrid items={data.achievements!} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    const names = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // claimable first
    expect(names()).toEqual(["Starter Shelf", "Fresh Start", "Pack Rat"]);
    fireEvent.click(screen.getByRole("button", { name: "Earned" }));
    expect(names()).toEqual(["Fresh Start"]);
    fireEvent.click(screen.getByRole("button", { name: "To do" }));
    expect(names()).toEqual(["Starter Shelf", "Pack Rat"]);
    expect(screen.getByText("Open 100 boosters")).toBeTruthy();
    expect(screen.getByText("71/100")).toBeTruthy();
  });
});

describe("locale formatting", () => {
  it("formats progress, targets, rewards and counts in the en locale", () => {
    wrap(<AchievementGrid items={[item("ach_open_1000", 1000, 2500, false, 1200)]} />);
    expect(screen.getByText("1,000/2,500")).toBeTruthy();
    expect(screen.getByText(/\+1,200/)).toBeTruthy();
    cleanup();
    wrap(<StreakPanel streak={streak({ loginsTotal: 1500, rewards: [20, 30, 40, 50, 60, 80, 1000] })} />);
    expect(screen.getByText("1,000")).toBeTruthy();
    expect(screen.getByText(/1,500 logins in total/)).toBeTruthy();
  });
});

describe("reset countdown", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes once when the daily reset is reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T22:59:58Z"));
    wrap(<MissionList section="daily" items={data.daily!} bonus={data.bonuses.daily} resetAt="2026-11-15T23:00:00Z" />);
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("MissionsContent", () => {
  it("shows an error line when my_missions fails", async () => {
    serverRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    wrap(await MissionsContent());
    expect(serverRpc).toHaveBeenCalledWith("my_missions");
    expect(screen.getByRole("alert")).toHaveTextContent(messages.missions.loadError);
  });
});

describe("Claim all", () => {
  it("shows the count and claims every claimable key", async () => {
    serverRpc.mockResolvedValue({ data, error: null });
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { currency: 500, granted: null }, error: null });
    wrap(await MissionsContent());
    const button = screen.getByRole("button", { name: "Claim all · 3" });
    fireEvent.click(button);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([
      { p_key: "first_wishlist" },
      { p_key: "daily_pages" },
      { p_key: "ach_own_50" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("+60");
  });

  it("is hidden with nothing to claim", async () => {
    serverRpc.mockResolvedValue({ data: { ...data, claimable: 0 }, error: null });
    wrap(await MissionsContent());
    expect(screen.queryByRole("button", { name: /Claim all/ })).toBeNull();
  });
});

describe("Missions on phones", () => {
  it("shows one section at a time, switched by the chips", async () => {
    serverRpc.mockResolvedValue({ data, error: null });
    wrap(await MissionsContent());
    // first section with something to claim
    expect(screen.getByTestId("section-first")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("section-weekly")).toHaveAttribute("data-active", "false");
    fireEvent.click(screen.getByRole("tab", { name: /Weekly/ }));
    expect(screen.getByTestId("section-weekly")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("section-first")).toHaveAttribute("data-active", "false");
  });
});
