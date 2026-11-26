import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomePack } from "@/components/home/BoosterGrid";
import { BoosterSheet } from "@/components/mobile/BoosterSheet";
import { AccountMenu } from "@/components/AccountMenu";
import { BottomNav } from "@/components/mobile/BottomNav";
import { CollectionGrid } from "@/components/CollectionGrid";
import { RecycleButton } from "@/components/RecycleButton";
import type { Status } from "@/lib/game/types";
import messages from "../../messages/en.json";

let pathname = "/";
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/boosterSheet", () => ({ getSheetBoosters: load }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn() }, rpc: vi.fn() }),
}));

const pack = (id: string, kind: HomePack["kind"], o: Partial<HomePack> = {}): HomePack => ({
  id,
  kind,
  price: null,
  fallbackPrice: 150,
  slotFloors: ["common", "common", "common", "uncommon", "rare"],
  multipliers: {},
  themeId: null,
  characters: 120,
  thumbs: [],
  title: null,
  endsAt: null,
  ...o,
});
const status: Status = {
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
};
const PACKS = [pack("mix", "free"), pack("shonen", "free"), pack("hall_of_fame", "shop", { price: 750 })];

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// the More sheet's install button asks whether the game already runs as the app
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;

beforeEach(() => {
  load.mockResolvedValue({ status, packs: PACKS, dailyName: null });
});
afterEach(() => {
  cleanup();
  pathname = "/";
  load.mockReset();
});

describe("AccountMenu", () => {
  it("encodes the username in My profile", () => {
    wrap(
      <AccountMenu playerId="u1" me={{ username: "a#b c%", avatar_url: null }} initialUnread={0}>
        <span />
      </AccountMenu>,
    );
    expect(screen.getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile/a%23b%20c%25");
  });
});

describe("BottomNav", () => {
  it("renders five items with the Open button in the middle", () => {
    wrap(<BottomNav missionsClaimable={0} />);
    const nav = screen.getByRole("navigation", { name: messages.nav.label });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[2]).getByRole("button", { name: messages.nav.open })).toBeInTheDocument();
    expect(within(items[0]).getByRole("link", { name: messages.nav.home })).toHaveAttribute("aria-current", "page");
    expect(within(items[3]).getByRole("link", { name: messages.nav.market })).toHaveAttribute("href", "/market");
  });

  it("loads the boosters only when the Open button opens the sheet", async () => {
    wrap(<BottomNav missionsClaimable={0} />);
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: messages.nav.open }));
    const sheet = screen.getByRole("dialog", { name: messages.home.grid.title });
    expect(within(sheet).getByRole("status")).toHaveTextContent(messages.sheet.loading);
    expect(await within(sheet).findByRole("button", { name: /^Mix/ })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("More sheet", () => {
  it("links to the missions page with the claimable dot", () => {
    wrap(<BottomNav missionsClaimable={2} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    const sheet = screen.getByRole("dialog", { name: messages.nav.moreTitle });
    const link = within(sheet).getByRole("link", { name: /Missions/ });
    expect(link).toHaveAttribute("href", "/missions");
    expect(within(link).getByTestId("claimable-dot")).toBeInTheDocument();
  });

  it("starts with Invite friends", () => {
    wrap(<BottomNav missionsClaimable={0} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    const sheet = screen.getByRole("dialog", { name: messages.nav.moreTitle });
    const first = within(sheet).getAllByRole("link")[0];
    expect(first).toHaveTextContent("Invite friends");
    expect(first).toHaveAttribute("href", "/invite-friends");
  });

  it("shows Rebirth to staff only; Leaderboard to everyone", () => {
    wrap(<BottomNav missionsClaimable={0} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    let sheet = screen.getByRole("dialog", { name: messages.nav.moreTitle });
    expect(within(sheet).queryByRole("link", { name: messages.nav.rebirth })).toBeNull();
    expect(within(sheet).getByRole("link", { name: messages.nav.leaderboard })).toHaveAttribute("href", "/leaderboard");
    cleanup();
    wrap(<BottomNav missionsClaimable={0} isStaff />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    sheet = screen.getByRole("dialog", { name: messages.nav.moreTitle });
    expect(within(sheet).getByRole("link", { name: messages.nav.rebirth })).toHaveAttribute("href", "/rebirth");
  });

  it("hides the dot when nothing is claimable", () => {
    wrap(<BottomNav missionsClaimable={0} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    const link = screen.getByRole("link", { name: /Missions/ });
    expect(within(link).queryByTestId("claimable-dot")).toBeNull();
  });

  it("links to My profile and Friends & messages, with an unread dot on More", () => {
    wrap(<BottomNav missionsClaimable={0} social={{ playerId: "u1", username: "kenji", unread: 3 }} />);
    expect(screen.getByTestId("messages-dot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    const sheet = screen.getByRole("dialog", { name: messages.nav.moreTitle });
    expect(within(sheet).getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile/kenji");
    const friends = within(sheet).getByRole("link", { name: /Friends & messages/ });
    expect(friends).toHaveAttribute("href", "/friends");
    expect(friends).toHaveTextContent("3");
    expect(within(sheet).getByRole("link", { name: "Wiki" })).toHaveAttribute("href", "/wiki");
  });

  it("encodes the username in My profile", () => {
    wrap(<BottomNav missionsClaimable={0} social={{ playerId: "u1", username: "a#b c%", unread: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    expect(screen.getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile/a%23b%20c%25");
  });

  it("Notifications closes the sheet and asks the bell to open", () => {
    const opened = vi.fn();
    window.addEventListener("notifications:open", opened);
    wrap(<BottomNav missionsClaimable={0} />);
    fireEvent.click(screen.getByRole("button", { name: messages.nav.more }));
    fireEvent.click(screen.getByRole("button", { name: messages.nav.notifications }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: messages.nav.moreTitle })).toBeNull();
    window.removeEventListener("notifications:open", opened);
  });
});

describe("BoosterSheet", () => {
  it("tapping a collapsed row expands it and collapses the previous one", async () => {
    wrap(<BoosterSheet onClose={() => {}} />);
    const mix = await screen.findByRole("button", { name: /^Mix/ });
    const shonen = screen.getByRole("button", { name: /^Shonen/ });
    expect(mix).toHaveAttribute("aria-expanded", "true");
    expect(shonen).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(shonen);
    expect(shonen).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Mix/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("Open links to the expanded pack's opening page", async () => {
    wrap(<BoosterSheet onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Shonen/ }));
    expect(screen.getByRole("link", { name: /^Open · Free/ })).toHaveAttribute("href", "/open/shonen");
  });

  it("starts on the given pack's tab", async () => {
    wrap(<BoosterSheet initialPack="hall_of_fame" onClose={() => {}} />);
    expect(await screen.findByRole("tab", { name: messages.home.tabs.shop })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Open · 750" })).toHaveAttribute("href", "/open/hall_of_fame");
  });

  it("shows reward packs in the row and on the Open link", async () => {
    load.mockResolvedValue({ status: { ...status, rewardPacks: { hall_of_fame: 1 } }, packs: PACKS, dailyName: null });
    wrap(<BoosterSheet initialPack="hall_of_fame" onClose={() => {}} />);
    const row = await screen.findByRole("button", { name: /^Hall of Fame/ });
    expect(within(row).getByText("Reward ×1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open · Reward · 1 left" })).toHaveAttribute("href", "/open/hall_of_fame");
  });

  it("shows a seasonal booster by its title with its end date", async () => {
    const fall = pack("season_fall26", "seasonal", { title: "Fall 2026", endsAt: "2026-12-01T12:00:00Z" });
    load.mockResolvedValue({ status, packs: [...PACKS, fall], dailyName: null });
    wrap(<BoosterSheet initialPack="season_fall26" onClose={() => {}} />);
    const row = await screen.findByRole("button", { name: /^Fall 2026/ });
    expect(within(row).getByText(/^Ends .*2026/)).toBeInTheDocument();
  });

  it("Escape and the close button close it", () => {
    const onClose = vi.fn();
    wrap(<BoosterSheet onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: messages.sheet.close }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows an error when the boosters can't be loaded", async () => {
    load.mockRejectedValue(new Error("offline"));
    wrap(<BoosterSheet onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.unknown);
  });

  it("closes when swiped down", () => {
    const onClose = vi.fn();
    wrap(<BoosterSheet onClose={onClose} />);
    const handle = screen.getByTestId("sheet-handle");
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 250 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 250 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Collection on phones", () => {
  const owned = (id: number, rarity: "rare" | "common") => ({
    card: {
      id,
      sourceId: id,
      number: id,
      name: `Card ${id}`,
      nativeName: null,
      imageUrl: null,
      seriesId: 1,
      seriesTitle: "Series",
      rarity,
      pow: 1,
      aura: 1,
    },
    count: 1,
  });

  // rarity and the other filters moved to CollectionToolbar (tests/ui/collection-toolbar.test.tsx)
  it("lists the cards it is given, with their count", () => {
    wrap(<CollectionGrid items={[owned(1, "rare"), owned(2, "common")]} total={10} />);
    expect(screen.getAllByText("Card 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Card 2").length).toBeGreaterThan(0);
    expect(screen.getByText("2 cards")).toBeInTheDocument();
  });

  it("spreads the card columns across the full width on wide screens (no empty strip on the right)", () => {
    wrap(<CollectionGrid items={[owned(1, "rare")]} total={10} />);
    expect(screen.getByRole("list")).toHaveClass("md:justify-between");
  });

  it("shows the recycle icon button with the duplicate count", () => {
    wrap(
      <RecycleButton
        mode="all"
        estimate={6}
        breakdown={[{ rarity: "common", copies: 6 }]}
        compact={{ duplicates: 6 }}
      />,
    );
    const button = screen.getByRole("button", { name: /recycle duplicates/i });
    expect(button).toHaveTextContent("6");
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Recycle duplicates" })).toBeInTheDocument();
  });
});
