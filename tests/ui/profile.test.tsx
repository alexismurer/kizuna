import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "@/components/social/Avatar";
import { FriendButton } from "@/components/social/FriendButton";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { ProfileTabs } from "@/components/social/Showcase";
import { ShowcasePicker } from "@/components/social/ShowcasePicker";
import type { ProfileCard, ProfileData } from "@/lib/social/types";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));
vi.mock("@/lib/push/client", () => ({ getPushState: async () => "default", enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh }),
}));

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const card = (id: number, o: Partial<ProfileCard> = {}): ProfileCard => ({
  id,
  number: id,
  name: `Hero ${id}`,
  nativeName: null,
  imageUrl: null,
  rarity: "rare",
  seriesTitle: "Series",
  pow: 1,
  aura: 1,
  ...o,
});

const profile = (o: Partial<ProfileData> = {}): ProfileData => ({
  id: "u2",
  username: "sakura",
  avatarUrl: null,
  memberSince: "2026-01-15T00:00:00Z",
  uniqueCards: 30,
  catalogSize: 120,
  mythics: 2,
  boostersOpened: 45,
  showcase: [card(1), card(2)],
  wishlist: [card(3)],
  recentPulls: [{ card: card(4, { rarity: "epic" }), pulledAt: "2026-02-01T00:00:00Z" }],
  isMe: false,
  friendship: "none",
  ...o,
});

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("Avatar", () => {
  it("falls back to the first letter", () => {
    wrap(<Avatar url={null} username="sakura" size={40} />);
    expect(screen.getByText("S")).toBeInTheDocument();
  });
  it("shows the image when there is one", () => {
    const { container } = wrap(<Avatar url="/a.png" username="sakura" size={40} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/a.png");
  });
});

describe("ProfileHeader + tabs", () => {
  it("shows the notification settings on my own profile only", async () => {
    wrap(<ProfileHeader profile={profile({ isMe: true })} owned={[]} />);
    expect(await screen.findByRole("heading", { name: messages.push.profileTitle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.push.enable })).toBeInTheDocument();
    cleanup();
    wrap(<ProfileHeader profile={profile({ isMe: false })} owned={[]} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("heading", { name: messages.push.profileTitle })).not.toBeInTheDocument();
  });

  it("renders stats", () => {
    wrap(<ProfileHeader profile={profile()} owned={[]} />);
    expect(screen.getByRole("heading", { name: "sakura" })).toBeInTheDocument();
    expect(screen.getByText("30/120")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("formats the card counts in the player's locale", () => {
    wrap(<ProfileHeader profile={profile({ uniqueCards: 1234, catalogSize: 5000 })} owned={[]} />);
    expect(screen.getByText("1,234/5,000")).toBeInTheDocument();
  });

  it("encodes the username in the Message link", () => {
    wrap(<ProfileHeader profile={profile({ username: "a#b c%", friendship: "friends" })} owned={[]} />);
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/messages/a%23b%20c%25");
  });

  it("shows showcase, wishlist and pulls in tabs", () => {
    wrap(<ProfileTabs profile={profile()} />);
    expect(screen.getByText("Hero 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Wishlist" }));
    expect(screen.getByText("Hero 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Recent pulls" }));
    expect(screen.getByText("Hero 4")).toBeInTheDocument();
  });

  it("links a card to its wiki page once its source id is known", () => {
    wrap(<ProfileTabs profile={profile({ showcase: [card(1, { sourceId: 81929 }), card(2)] })} />);
    expect(screen.getByText("Hero 1").closest("a")).toHaveAttribute("href", "/wiki/81929");
    expect(screen.getByText("Hero 2").closest("a")).toBeNull();
  });

  it("has sensible empty states for a player with nothing", () => {
    const p = profile({ uniqueCards: 0, mythics: 0, boostersOpened: 0, showcase: [], wishlist: [], recentPulls: [] });
    wrap(<ProfileHeader profile={p} owned={[]} />);
    expect(screen.getByText("0/120")).toBeInTheDocument();
    cleanup();
    wrap(<ProfileTabs profile={p} />);
    expect(screen.getByText(messages.profile.emptyShowcase)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Wishlist" }));
    expect(screen.getByText(messages.profile.emptyWishlist)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Recent pulls" }));
    expect(screen.getByText(messages.profile.emptyPulls)).toBeInTheDocument();
  });

  it("own profile: customize and copy link, no friend buttons", () => {
    wrap(<ProfileHeader profile={profile({ isMe: true })} owned={[card(1)]} />);
    expect(screen.getByRole("button", { name: "Customize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy my link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Propose a trade" })).toBeNull();
  });

  it("other profile: add friend and trade, message only for friends", () => {
    wrap(<ProfileHeader profile={profile()} owned={[]} />);
    expect(screen.getByRole("button", { name: "Add friend" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Propose a trade" })).toHaveAttribute(
      "href",
      "/market?tab=trades&to=sakura",
    );
    expect(screen.queryByRole("link", { name: "Message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Customize" })).toBeNull();
  });

  it("friends get a Message link", () => {
    wrap(<ProfileHeader profile={profile({ friendship: "friends" })} owned={[]} />);
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/messages/sakura");
  });
});

describe("FriendButton", () => {
  const states = (f: ProfileData["friendship"]) => {
    const onChange = vi.fn();
    wrap(<FriendButton username="sakura" friendship={f} onChange={onChange} />);
    return onChange;
  };

  it("adds a friend", async () => {
    rpc.mockResolvedValue({ data: "pending", error: null });
    const onChange = states("none");
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("pending_out"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("send_friend_request", { p_username: "sakura" });
  });

  it("cancels a sent request with remove_friend", async () => {
    const onChange = states("pending_out");
    fireEvent.click(screen.getByRole("button", { name: "Request sent (cancel)" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("none"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("remove_friend", { p_username: "sakura" });
  });

  it("accepts and declines", async () => {
    let onChange = states("pending_in");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("friends"));
    expect(rpc).toHaveBeenLastCalledWith("respond_friend_request", { p_username: "sakura", p_accept: true });
    cleanup();
    onChange = states("pending_in");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("none"));
    expect(rpc).toHaveBeenLastCalledWith("respond_friend_request", { p_username: "sakura", p_accept: false });
  });

  it("removes a friend from the menu", async () => {
    const onChange = states("friends");
    fireEvent.click(screen.getByRole("button", { name: /Friends/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("none"));
    expect(rpc).toHaveBeenCalledWith("remove_friend", { p_username: "sakura" });
  });

  it("shows a mapped error and keeps the state", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unknown_player" } });
    const onChange = states("none");
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.unknown_player);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ShowcasePicker", () => {
  const owned = Array.from({ length: 10 }, (_, i) => card(i + 1));
  const pick = (n: number) =>
    within(screen.getByRole("group", { name: "Your cards" })).getByRole("button", { name: new RegExp(`Hero ${n}$`) });

  it("enforces 8 and saves ordered ids", async () => {
    const onClose = vi.fn();
    wrap(<ShowcasePicker owned={owned} initial={[]} onClose={onClose} />);
    for (const n of [3, 1, 2, 4, 5, 6, 7, 8]) fireEvent.click(pick(n));
    expect(pick(9)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Hero 1 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("set_showcase", { p_card_ids: [1, 3, 2, 4, 5, 6, 7, 8] });
    expect(refresh).toHaveBeenCalled();
  });

  it("tapping a chosen card removes it", async () => {
    wrap(<ShowcasePicker owned={owned} initial={[1, 2]} onClose={vi.fn()} />);
    fireEvent.click(pick(1));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_showcase", { p_card_ids: [2] }));
  });
});
