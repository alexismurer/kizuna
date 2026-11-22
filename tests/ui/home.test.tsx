import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BigPulls } from "@/components/home/BigPulls";
import { BoosterGrid, type HomePack } from "@/components/home/BoosterGrid";
import { Hero, type HeroSlide } from "@/components/home/Hero";
import { PackSidePanel } from "@/components/home/PackSidePanel";
import { StatusTiles } from "@/components/home/StatusTiles";
import { TopBar } from "@/components/TopBar";
import type { Status } from "@/lib/game/types";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const loadStatus = vi.hoisted(() => vi.fn());
const dmUnread = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/supabase/boosters", () => ({ loadStatus }));
const customActions = vi.hoisted(() => ({ getCustomOptions: vi.fn(), saveCustomSeries: vi.fn() }));
vi.mock("@/lib/actions/customBooster", () => customActions);
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } } }) },
    rpc: async () => ({ data: dmUnread.count, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { username: "kenji", avatar_url: null } }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/market/notifications", () => ({
  loadNotifications: async () => ({
    items: [{ id: 1, kind: "trade_expired", payload: { trade_id: 1 }, createdAt: new Date().toISOString(), read: false }],
    names: {},
  }),
}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return { getTranslations: async () => createTranslator({ locale: "en", messages }) };
});

const rpc = vi.fn();
const inIds = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ in: (...a: unknown[]) => inIds(...a) }) }),
  }),
}));

const pack = (
  id: string,
  kind: HomePack["kind"],
  o: Partial<HomePack> = {},
): HomePack => ({
  id,
  kind,
  price: null,
  fallbackPrice: null,
  slotFloors: ["common", "common", "common", "uncommon", "rare"],
  multipliers: {},
  themeId: null,
  characters: 120,
  thumbs: [],
  title: null,
  endsAt: null,
  ...o,
});
const status = (o: Partial<Status> = {}): Status => ({
  freeStock: 3,
  nextFreeAt: null,
  currency: 0,
  untilGolden: 4,
  untilPity: 120,
  dailyOpenedToday: false,
  rewardPacks: {},
  missionsClaimable: 0,
  dailyDone: 0,
  streakDay: 1,
  streakClaimedToday: true,
  ...o,
});

const PACKS = [
  pack("mix", "free", { fallbackPrice: 150 }),
  pack("hall_of_fame", "shop", { price: 750 }),
  pack("daily", "daily"),
];

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  inIds.mockReset();
});

const card = (n: number) => ({
  number: n,
  sourceId: 1000 + n,
  total: 100,
  name: `Hero ${n}`,
  imageUrl: null,
  seriesTitle: "Series",
  rarity: "rare" as const,
  pow: 10,
  aura: 10,
});

describe("Hero", () => {
  const slide = (o: Partial<HeroSlide> = {}): HeroSlide => ({
    packId: "daily",
    title: "Test Pool",
    cards: [card(1), card(2), card(3)],
    seePack: "daily",
    noPool: false,
    ...o,
  });

  it("shows today's pool name and links the CTA to the daily opening", () => {
    wrap(<Hero slides={[slide()]} dailyOpened={false} />);
    expect(screen.getByRole("heading", { name: "Test Pool" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.home.hero.openDaily })).toHaveAttribute(
      "href",
      "/open/daily",
    );
    expect(screen.getByText("Hero 2")).toBeInTheDocument();
    expect(screen.getByText("Hero 2").closest("a")).toHaveAttribute("href", "/wiki/1002");
  });

  it("shows the daily tagline on the daily slide and the seasonal one on seasonal slides", () => {
    wrap(<Hero slides={[slide(), slide({ packId: "season_x", title: "Spring", seePack: "season_x" })]} dailyOpened={false} />);
    expect(screen.getByText(messages.packs.daily.tagline)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show slide 2" }));
    expect(screen.getByText(messages.packs.seasonal.tagline)).toBeInTheDocument();
  });

  it("disables the CTA when there is no pool today", () => {
    wrap(<Hero slides={[slide({ title: "Daily", noPool: true, seePack: "mix" })]} dailyOpened={false} />);
    expect(screen.getByRole("button", { name: messages.home.hero.none })).toBeDisabled();
    expect(screen.queryByRole("link", { name: messages.home.hero.openDaily })).toBeNull();
  });
});

describe("BoosterGrid", () => {
  it("shows Free under free packs while there is stock", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    const mix = screen.getByRole("button", { name: /^Mix/ });
    expect(within(mix.parentElement!).getByText(messages.home.grid.free)).toBeInTheDocument();
  });

  it("shows the fallback price for mix at stock 0", () => {
    wrap(<BoosterGrid packs={PACKS} status={status({ freeStock: 0 })} dailyName="Test Pool" />);
    const mix = screen.getByRole("button", { name: /^Mix/ });
    expect(within(mix.parentElement!).getByText("150")).toBeInTheDocument();
  });

  it("shows when a live custom booster ends, and keeps every price label on one line at the bottom of its tile", () => {
    const custom = pack("custom", "free", { fallbackPrice: 175, customSet: true, endsAt: "2026-11-29T20:00:00Z" });
    wrap(<BoosterGrid packs={[...PACKS, custom]} status={status()} dailyName="Test Pool" />);
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    const tile = screen.getByRole("button", { name: /^Custom/ }).parentElement!;
    expect(within(tile).getByText(/Ends Nov 29, 2026/)).toBeInTheDocument();
    expect(within(tile).getByText(messages.home.grid.free).parentElement).toHaveClass("mt-auto");
  });

  it("lists the Custom booster in the Daily & limited tab with its 175 fallback price", () => {
    const custom = pack("custom", "free", { fallbackPrice: 175, customSet: true });
    wrap(<BoosterGrid packs={[...PACKS, custom]} status={status({ freeStock: 0 })} dailyName="Test Pool" />);
    expect(screen.queryByRole("button", { name: /^Custom/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    const tile = screen.getByRole("button", { name: /^Custom/ });
    expect(within(tile.parentElement!).getByText("175")).toBeInTheDocument();
  });

  it("switching to Shop shows Hall of Fame", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    expect(screen.queryByRole("button", { name: /^Hall of Fame/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.shop }));
    expect(screen.getByRole("button", { name: /^Hall of Fame/ })).toBeInTheDocument();
  });

  it("shows a reward badge on packs the player was granted", () => {
    wrap(
      <BoosterGrid
        packs={PACKS}
        status={status({ rewardPacks: { hall_of_fame: 2, daily: 1 } })}
        dailyName="Test Pool"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.shop }));
    const hof = screen.getByRole("button", { name: /^Hall of Fame/ });
    expect(within(hof.parentElement!).getByText("Reward ×2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    expect(screen.queryByText(/Reward ×/)).toBeNull();
  });

  it("draws the daily pack as a dated pouch named after today's pool", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    const daily = screen.getByRole("button", { name: messages.packs.daily.name });
    expect(within(daily).getByTestId("pouch-date")).toBeInTheDocument();
    expect(within(daily).getByText("Test Pool")).toBeInTheDocument();
  });

  it("disables the daily Open when there is no pool", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName={null} />);
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    expect(screen.getByRole("button", { name: messages.home.hero.none })).toBeDisabled();
  });

  it("lists a seasonal booster by its title in Daily & limited with its end date", () => {
    const fall = pack("season_fall26", "seasonal", { title: "Fall 2026", endsAt: "2026-12-01T12:00:00Z" });
    wrap(<BoosterGrid packs={[...PACKS, fall]} status={status()} dailyName="Test Pool" />);
    expect(screen.queryByRole("button", { name: "Fall 2026" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    const btn = screen.getByRole("button", { name: "Fall 2026" });
    expect(within(btn.parentElement!).getByText(/^Ends .*2026/)).toBeInTheDocument();
  });

  it("full screen toggles an overlay that Escape closes", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    fireEvent.click(screen.getByRole("button", { name: messages.home.grid.fullscreen }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps focus on the toggle when entering and leaving full screen", () => {
    document.body.style.overflow = "auto";
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    const toggle = screen.getByRole("button", { name: messages.home.grid.fullscreen });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: messages.home.grid.exitFullscreen })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: messages.home.grid.fullscreen })).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("traps Tab inside full screen", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    fireEvent.click(screen.getByRole("button", { name: messages.home.grid.fullscreen }));
    const dialog = screen.getByRole("dialog");
    const items = dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
    items[items.length - 1].focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(items[0]).toHaveFocus();
  });
});

describe("PackSidePanel", () => {
  const panel = (p: HomePack, s: Status) =>
    wrap(<PackSidePanel pack={p} name="Name" status={s} noPool={false} />);

  it("shows golden and pity tiles for standard packs and links to the opening", () => {
    panel(PACKS[0], status());
    expect(screen.getByText(messages.home.panel.golden)).toBeInTheDocument();
    expect(screen.getByText(messages.home.panel.pity)).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See the 120 characters/ })).toHaveAttribute(
      "href",
      "/open/mix/characters",
    );
    expect(screen.getByRole("link", { name: "Open · Free · 3 left" })).toHaveAttribute(
      "href",
      "/open/mix",
    );
  });

  it("offers reward packs first on the Open button", () => {
    panel(PACKS[1], status({ rewardPacks: { hall_of_fame: 1 } }));
    expect(screen.getByText("Reward ×1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open · Reward · 1 left" })).toHaveAttribute(
      "href",
      "/open/hall_of_fame",
    );
  });

  it("custom booster without picks: Create for 250, no Open link", () => {
    panel(pack("custom", "free", { fallbackPrice: 175, customSet: false }), status());
    expect(screen.getByRole("button", { name: "Create your booster · 250" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Open/ })).toBeNull();
  });

  it("Create shows a spinner and is busy while the series list loads", async () => {
    customActions.getCustomOptions.mockReturnValue(new Promise(() => {}));
    panel(pack("custom", "free", { fallbackPrice: 175, customSet: false }), status());
    const create = screen.getByRole("button", { name: /Create your booster · 250/ });
    fireEvent.click(create);
    expect(create).toHaveAttribute("aria-busy", "true");
    expect(create).toBeDisabled();
    expect(within(create).getByTestId("spinner")).toBeInTheDocument();
  });

  it("custom booster with picks: the usual Open link plus Edit for 150", () => {
    panel(pack("custom", "free", { fallbackPrice: 175, customSet: true }), status());
    expect(screen.getByRole("link", { name: "Open · Free · 3 left" })).toHaveAttribute("href", "/open/custom");
    expect(screen.getByRole("button", { name: "Edit · 150" })).toBeInTheDocument();
  });

  it("custom booster: after a save the panel switches to Open + Edit without a reload (booster sheet)", async () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `S${i + 1}`, cover: null, cards: 5 }));
    customActions.getCustomOptions.mockResolvedValue({ series, picked: [] });
    customActions.saveCustomSeries.mockResolvedValue({ error: null });
    panel(pack("custom", "free", { fallbackPrice: 175, customSet: false }), status());
    fireEvent.click(screen.getByRole("button", { name: "Create your booster · 250" }));
    const boxes = await screen.findAllByRole("checkbox");
    boxes.forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: "Save · 250" }));
    expect(await screen.findByRole("button", { name: "Edit · 150" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open · Free · 3 left" })).toHaveAttribute("href", "/open/custom");
  });

  it("hides golden and pity tiles for the daily pack", () => {
    panel(PACKS[2], status());
    expect(screen.queryByText(messages.home.panel.golden)).toBeNull();
    expect(screen.queryByText(messages.home.panel.pity)).toBeNull();
  });

  it("shows the next booster as a sure Mythic at 1 and a count above", () => {
    panel(PACKS[0], status({ untilPity: 1 }));
    expect(screen.getByText(messages.home.panel.pityNext)).toBeInTheDocument();
    expect(screen.queryByText(messages.home.panel.pity)).toBeNull();
    cleanup();
    panel(PACKS[0], status({ untilPity: 2 }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(messages.home.panel.pity)).toBeInTheDocument();
  });
});

describe("StatusTiles", () => {
  it("shows the next booster wording at 1 and the count above", () => {
    wrap(<StatusTiles status={status({ untilPity: 1 })} />);
    expect(screen.getAllByText(messages.home.tiles.pityNext).length).toBeGreaterThan(0);
    expect(screen.queryByText("1")).toBeNull();
    cleanup();
    wrap(<StatusTiles status={status({ untilPity: 7 })} />);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.queryByText(messages.home.tiles.pityNext)).toBeNull();
  });
});

describe("StatusTiles progress", () => {
  it("shows daily missions and the login streak linking to the missions page", () => {
    wrap(<StatusTiles status={status({ dailyDone: 2, streakDay: 4 })} />);
    for (const name of [/2\/3 daily missions/, /Day 4 login streak/]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/missions");
    }
    // every desktop chip is a link: free, golden and pity scroll to the boosters
    for (const name of [/3\/10 free boosters/, /before the golden booster/, /until a sure Mythic/]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/#boosters");
    }
    // 5 desktop chips + the 2 phone tiles that link
    expect(screen.getAllByRole("link")).toHaveLength(7);
  });

  it("orders the desktop chips: free, daily, streak, golden, pity", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StatusTiles status={status({ dailyDone: 1, streakDay: 2 })} />
      </NextIntlClientProvider>,
    );
    const row = container.querySelector(".md\\:flex")!;
    const chips = row.children;
    // full labels in every language: the row wraps (3 + 2) instead of cutting them,
    // and stays one line while it fits
    expect(row).toHaveClass("flex-wrap", "justify-center");
    expect(row.querySelector("[data-break]")).toBeNull();
    expect([...chips].map((c) => c.textContent)).toEqual([
      "3/10 free boosters",
      "1/3 daily missions",
      "Day 2 login streak",
      "4 before the golden booster",
      "120 until a sure Mythic",
    ]);
  });
});

describe("TopBar", () => {
  it("links to the missions page with a dot and count when rewards are claimable", async () => {
    loadStatus.mockResolvedValue(status({ missionsClaimable: 3 }));
    wrap(await TopBar());
    const link = screen.getByRole("link", { name: /Missions/ });
    expect(link).toHaveAttribute("href", "/missions");
    expect(link).toHaveTextContent("3 rewards to claim");
    expect(within(link).getByTestId("claimable-dot")).toBeInTheDocument();
  });

  it("has an Invite link with a +3 chip to the invite page", async () => {
    loadStatus.mockResolvedValue(status());
    wrap(await TopBar());
    const link = screen.getByRole("link", { name: /Invite/ });
    expect(link).toHaveAttribute("href", "/invite-friends");
    expect(link).toHaveTextContent("+3");
  });

  it("shows the notifications bell with its unread count", async () => {
    loadStatus.mockResolvedValue(status());
    wrap(await TopBar());
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toHaveTextContent("1");
  });

  it("has an account menu with profile, friends and sign out", async () => {
    loadStatus.mockResolvedValue(status());
    wrap(await TopBar());
    expect(screen.getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile/kenji");
    expect(screen.getByRole("link", { name: "Friends & messages" })).toHaveAttribute("href", "/friends");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows the messages dot and count on the account menu only when there are unread messages", async () => {
    loadStatus.mockResolvedValue(status());
    dmUnread.count = 4;
    wrap(await TopBar());
    expect(screen.getByTestId("messages-dot")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Friends & messages/ })).toHaveTextContent("4");
    cleanup();
    dmUnread.count = 0;
    wrap(await TopBar());
    expect(screen.queryByTestId("messages-dot")).toBeNull();
  });

  it("shows no dot when nothing is claimable", async () => {
    loadStatus.mockResolvedValue(status());
    wrap(await TopBar());
    const link = screen.getByRole("link", { name: /Missions/ });
    expect(within(link).queryByTestId("claimable-dot")).toBeNull();
  });
});

describe("BigPulls", () => {
  it("renders usernames from the feed", async () => {
    rpc.mockResolvedValue({
      data: [
        { card_id: 7, rarity: "mythic", username: "sakura", pulled_at: new Date().toISOString() },
        { card_id: 8, rarity: "legendary", username: "kenji", pulled_at: new Date(Date.now() - 180_000).toISOString() },
      ],
      error: null,
    });
    inIds.mockResolvedValue({
      data: [
        { id: 7, source_id: 81929, name: "Hero 7", image_url: null },
        { id: 8, source_id: 17, name: "Hero 8", image_url: null },
      ],
      error: null,
    });
    wrap(<BigPulls />);
    expect(await screen.findByText("sakura")).toBeInTheDocument();
    expect(screen.getByText("kenji")).toBeInTheDocument();
    expect(screen.getByText("3 minutes ago")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("recent_big_pulls", { p_limit: 12 });
  });

  it("links each pull to the character's wiki page", async () => {
    rpc.mockResolvedValue({
      data: [{ card_id: 7, rarity: "mythic", username: "sakura", pulled_at: new Date().toISOString() }],
      error: null,
    });
    inIds.mockResolvedValue({ data: [{ id: 7, source_id: 81929, name: "Hero 7", image_url: null }], error: null });
    wrap(<BigPulls />);
    const link = (await screen.findByText("Hero 7")).closest("a");
    expect(link).toHaveAttribute("href", "/wiki/81929");
    expect(fireEvent.click(link!)).toBe(true);
  });

  it("does not open the page after a mouse drag", async () => {
    rpc.mockResolvedValue({
      data: [{ card_id: 7, rarity: "mythic", username: "sakura", pulled_at: new Date().toISOString() }],
      error: null,
    });
    inIds.mockResolvedValue({ data: [{ id: 7, source_id: 81929, name: "Hero 7", image_url: null }], error: null });
    wrap(<BigPulls />);
    const link = (await screen.findByText("Hero 7")).closest("a")!;
    fireEvent.pointerDown(link, { pointerType: "mouse", button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 60 });
    fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 60 });
    // fireEvent returns false when the click's default was prevented
    expect(fireEvent.click(link)).toBe(false);
    // the next plain click opens it again
    fireEvent.pointerDown(link, { pointerType: "mouse", button: 0, clientX: 100 });
    fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 102 });
    expect(fireEvent.click(link)).toBe(true);
  });

  it("shows the empty state when the first load fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    wrap(<BigPulls />);
    expect(await screen.findByText(messages.home.bigPulls.empty)).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    wrap(<BigPulls />);
    expect(await screen.findByText(messages.home.bigPulls.empty)).toBeInTheDocument();
  });
});
