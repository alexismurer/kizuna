import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BigPulls } from "@/components/home/BigPulls";
import { BoosterGrid, type HomePack } from "@/components/home/BoosterGrid";
import { Hero, type HeroSlide } from "@/components/home/Hero";
import { PackSidePanel } from "@/components/home/PackSidePanel";
import { StatusTiles } from "@/components/home/StatusTiles";
import type { Status } from "@/lib/game/types";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
  ...o,
});
const status = (o: Partial<Status> = {}): Status => ({
  freeStock: 3,
  nextFreeAt: null,
  currency: 0,
  untilGolden: 4,
  untilPity: 120,
  dailyOpenedToday: false,
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

  it("switching to Shop shows Hall of Fame", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName="Test Pool" />);
    expect(screen.queryByRole("button", { name: /^Hall of Fame/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.shop }));
    expect(screen.getByRole("button", { name: /^Hall of Fame/ })).toBeInTheDocument();
  });

  it("disables the daily Open when there is no pool", () => {
    wrap(<BoosterGrid packs={PACKS} status={status()} dailyName={null} />);
    fireEvent.click(screen.getByRole("tab", { name: messages.home.tabs.daily }));
    expect(screen.getByRole("button", { name: messages.home.hero.none })).toBeDisabled();
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

  it("hides golden and pity tiles for the daily pack", () => {
    panel(PACKS[2], status());
    expect(screen.queryByText(messages.home.panel.golden)).toBeNull();
    expect(screen.queryByText(messages.home.panel.pity)).toBeNull();
  });

  it("treats a pity of 0 or less as the next booster", () => {
    panel(PACKS[0], status({ untilPity: -2 }));
    expect(screen.getByText(messages.home.panel.pityNext)).toBeInTheDocument();
    expect(screen.queryByText("-2")).toBeNull();
  });
});

describe("StatusTiles", () => {
  it("never shows a negative pity count", () => {
    wrap(<StatusTiles status={status({ untilPity: -1 })} />);
    expect(screen.queryByText("-1")).toBeNull();
    expect(screen.getByText(messages.home.tiles.pityNext)).toBeInTheDocument();
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
        { id: 7, name: "Hero 7", image_url: null },
        { id: 8, name: "Hero 8", image_url: null },
      ],
      error: null,
    });
    wrap(<BigPulls />);
    expect(await screen.findByText("sakura")).toBeInTheDocument();
    expect(screen.getByText("kenji")).toBeInTheDocument();
    expect(screen.getByText("3 minutes ago")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("recent_big_pulls", { p_limit: 12 });
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
