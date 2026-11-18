import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FriendsList } from "@/components/social/FriendsList";
import type { FriendsData } from "@/lib/social/types";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
type Sub = { table: string; opts: { event?: string; filter?: string }; cb: () => void };
const subs: Sub[] = [];
const chan: { on: (t: string, o: Sub["opts"] & { table: string }, cb: () => void) => unknown; subscribe: () => unknown } = {
  on: (_t, o, cb) => {
    subs.push({ table: o.table, opts: o, cb });
    return chan;
  },
  subscribe: () => chan,
};
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    channel: () => chan,
    removeChannel: vi.fn(),
    realtime: { setAuth: async () => {} },
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const NOW = new Date("2026-11-16T12:00:00Z");
function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} now={NOW} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

const data: FriendsData = {
  friends: [
    { id: "u2", username: "sakura", avatarUrl: null, since: "2026-10-01T00:00:00Z", unread: 3 },
    { id: "u3", username: "taro", avatarUrl: null, since: "2026-10-02T00:00:00Z", unread: 0 },
  ],
  incoming: [{ username: "hana", avatarUrl: null, at: "2026-11-15T00:00:00Z" }],
  outgoing: [{ username: "ken", avatarUrl: null, at: "2026-11-14T00:00:00Z" }],
};

beforeEach(() => {
  subs.length = 0;
  rpc.mockReset();
  refresh.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("friends page", () => {
  it("refreshes on an own notification insert and does not listen to friendships", async () => {
    wrap(<FriendsList data={data} playerId="me" />);
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    expect(subs.map((s) => s.table).sort()).toEqual(["direct_messages", "notifications"]);
    const n = subs.find((s) => s.table === "notifications")!;
    expect(n.opts).toMatchObject({ event: "INSERT", filter: "player_id=eq.me" });
    vi.useFakeTimers();
    act(() => n.cb());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("lists friends with profile links, unread badge and a Message link", () => {
    wrap(<FriendsList data={data} playerId="me" />);
    expect(screen.getByRole("link", { name: "sakura" })).toHaveAttribute("href", "/profile/sakura");
    expect(screen.getByText("3 unread")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Message" })[0]).toHaveAttribute("href", "/messages/sakura");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("opens the Requests tab from the initial tab and accepts once", async () => {
    wrap(<FriendsList data={data} playerId="me" initialTab="requests" />);
    const accept = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("respond_friend_request", { p_username: "hana", p_accept: true });
  });

  it("declines an incoming request and cancels an outgoing one", async () => {
    wrap(<FriendsList data={data} playerId="me" initialTab="requests" />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("respond_friend_request", { p_username: "hana", p_accept: false }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("remove_friend", { p_username: "ken" }));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("follows a new initialTab on client navigation", () => {
    const ui = (tab: "friends" | "requests") => (
      <NextIntlClientProvider locale="en" messages={messages} now={NOW} timeZone="UTC">
        <FriendsList data={data} playerId="me" initialTab={tab} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui("friends"));
    expect(screen.getByRole("tab", { name: "Friends" })).toHaveAttribute("aria-selected", "true");
    rerender(ui("requests"));
    expect(screen.getByRole("tab", { name: /Requests/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("hana")).toBeInTheDocument();
  });

  it("switches tabs without calling the server", () => {
    wrap(<FriendsList data={data} playerId="me" />);
    fireEvent.click(screen.getByRole("tab", { name: /Requests/ }));
    expect(screen.getByText("hana")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("find players", () => {
  it("debounces the search by 300 ms and adds a friend", async () => {
    vi.useFakeTimers();
    rpc.mockImplementation(async (fn: string) =>
      fn === "find_players" ? { data: [{ id: "u9", username: "mika" }], error: null } : { data: "pending", error: null },
    );
    wrap(<FriendsList data={data} playerId="me" />);
    fireEvent.click(screen.getByRole("tab", { name: "Find players" }));
    const input = screen.getByLabelText("Search players by username");
    fireEvent.change(input, { target: { value: "mi" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    fireEvent.change(input, { target: { value: "mik" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("find_players", { p_query: "mik" });
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rpc).toHaveBeenCalledWith("send_friend_request", { p_username: "mika" });
    expect(screen.getByText("Request sent")).toBeInTheDocument();
  });

  it("shows the mapped error when the request fails", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "find_players"
        ? { data: [{ id: "u9", username: "mika" }], error: null }
        : { data: null, error: { message: "already_requested" } },
    );
    wrap(<FriendsList data={data} playerId="me" />);
    fireEvent.click(screen.getByRole("tab", { name: "Find players" }));
    fireEvent.change(screen.getByLabelText("Search players by username"), { target: { value: "mika" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.already_requested);
  });
});
