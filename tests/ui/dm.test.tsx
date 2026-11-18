import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardAttachment } from "@/components/social/CardAttachment";
import { DmThread } from "@/components/social/DmThread";
import type { DmRow, ProfileCard, ThreadMessage } from "@/lib/social/types";
import messages from "../../messages/en.json";

const rpc = vi.fn();
type Handler = (p: { new: DmRow }) => void;
const handlers: Handler[] = [];
const statuses: ((s: string) => void)[] = [];
const chan: {
  on: (t: string, o: { filter?: string }, cb: Handler) => unknown;
  subscribe: (cb: (s: string) => void) => unknown;
} = {
  on: (_t, _o, cb) => {
    handlers.push(cb);
    return chan;
  },
  subscribe: (cb) => {
    statuses.push(cb);
    cb("SUBSCRIBED");
    return chan;
  },
};
// every query method returns the same chain; awaiting it yields `rows`
let rows: unknown[] = [];
const query: Record<string, unknown> = {};
for (const m of ["select", "gt", "ilike", "order", "limit", "range"]) query[m] = () => query;
query.then = (ok: (v: unknown) => unknown) => ok({ data: rows, error: null });
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from: () => query,
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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const NOW = new Date("2026-11-16T12:00:00Z");
function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} now={NOW} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

const card: ProfileCard = {
  id: 5,
  number: 5,
  name: "Hero Five",
  nativeName: null,
  imageUrl: null,
  rarity: "epic",
  seriesTitle: "Skyline",
  pow: 1,
  aura: 1,
};
const msg = (id: number, o: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  fromId: "u2",
  mine: false,
  body: `hello ${id}`,
  card: null,
  tag: null,
  createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  readAt: null,
  ...o,
});
const row = (id: number, o: Partial<DmRow> = {}): DmRow => ({
  id,
  from_id: "u2",
  to_id: "me",
  body: `live ${id}`,
  card_id: null,
  tag: null,
  created_at: NOW.toISOString(),
  read_at: null,
  ...o,
});

const view = (initial: ThreadMessage[] = [msg(1), msg(2, { mine: true, fromId: "me", body: "mine 2" })], canSend = true) =>
  wrap(<DmThread username="sakura" playerId="me" otherId="u2" initial={initial} initialHasMore={false} canSend={canSend} />);

const emit = async (r: DmRow) => {
  await waitFor(() => expect(handlers).toHaveLength(2));
  await act(async () => handlers.forEach((h) => h({ new: r })));
};
const markReads = () => rpc.mock.calls.filter((c) => c[0] === "mark_dm_read").length;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  handlers.length = 0;
  statuses.length = 0;
  rows = [];
});
afterEach(() => cleanup());

describe("direct messages", () => {
  it("marks the thread read on open and on each new incoming message", async () => {
    view();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("mark_dm_read", { p_username: "sakura" }));
    const before = markReads();
    await emit(row(3));
    expect(screen.getByText("live 3")).toBeInTheDocument();
    await waitFor(() => expect(markReads()).toBe(before + 1));
  });

  it("ignores live messages from other conversations", async () => {
    view();
    await emit(row(3, { from_id: "u7", body: "someone else" }));
    expect(screen.queryByText("someone else")).toBeNull();
  });

  it("sends with the exact params on Enter and not on Shift+Enter", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "send_dm" ? { data: 7, error: null } : { data: null, error: null }));
    view();
    const box = screen.getByLabelText("Write a message");
    fireEvent.change(box, { target: { value: "hi there" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(rpc).not.toHaveBeenCalledWith("send_dm", expect.anything());
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("send_dm", { p_username: "sakura", p_body: "hi there", p_card_id: null, p_tag: null }),
    );
    expect(box).toHaveValue("");
  });

  it("shows the message at once as pending, and the realtime echo renders it once", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockImplementation((fn: string) =>
      fn === "send_dm" ? new Promise((r) => (resolve = r)) : Promise.resolve({ data: null, error: null }),
    );
    view();
    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("ping").closest("[data-pending]")).not.toBeNull();
    // echo first, then the RPC result
    await emit(row(9, { from_id: "me", to_id: "u2", body: "ping" }));
    await act(async () => resolve({ data: 9, error: null }));
    expect(screen.getAllByText("ping")).toHaveLength(1);
    expect(screen.getByText("ping").closest("[data-pending]")).toBeNull();
    // a duplicate echo changes nothing
    await emit(row(9, { from_id: "me", to_id: "u2", body: "ping" }));
    expect(screen.getAllByText("ping")).toHaveLength(1);
  });

  it("also renders once when the RPC result arrives before the echo", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "send_dm" ? { data: 9, error: null } : { data: null, error: null }));
    view();
    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "pong" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("pong").closest("[data-pending]")).toBeNull());
    await emit(row(9, { from_id: "me", to_id: "u2", body: "pong" }));
    expect(screen.getAllByText("pong")).toHaveLength(1);
  });

  it("blocks 301 characters client-side and shows the counter", () => {
    view();
    const box = screen.getByLabelText("Write a message");
    fireEvent.change(box, { target: { value: "a".repeat(300) } });
    expect(screen.getByText("300/300")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    fireEvent.change(box, { target: { value: "a".repeat(301) } });
    expect(screen.getByText("301/300")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(rpc).not.toHaveBeenCalledWith("send_dm", expect.anything());
  });

  it("maps rate_limited, removes the pending message and restores the text", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "send_dm" ? { data: null, error: { message: "rate_limited" } } : { data: null, error: null },
    );
    view();
    const box = screen.getByLabelText("Write a message");
    fireEvent.change(box, { target: { value: "spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.rate_limited);
    expect(box).toHaveValue("spam");
    expect(screen.queryByText("spam", { selector: "p" })).toBeNull();
  });

  it("renders a body with a script tag as plain text", () => {
    const body = "<script>alert(1)</script><b>x</b>";
    const { container } = view([msg(1, { body })]);
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("attaches one of your cards as Trading and sends it", async () => {
    rows = [{ count: 1, cards: { id: 5, number: 5, name: "Hero Five", native_name: null, image_url: null, rarity: "epic", pow: 1, aura: 1, series: { title: "Skyline" } } }];
    rpc.mockImplementation(async (fn: string) => (fn === "send_dm" ? { data: 12, error: null } : { data: null, error: null }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Attach a card" }));
    const dialog = await screen.findByRole("dialog", { name: "Attach a card" });
    fireEvent.click(await screen.findByRole("button", { name: /Hero Five/ }));
    expect(dialog).not.toBeInTheDocument();
    expect(screen.getByText("TRADING")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("send_dm", { p_username: "sakura", p_body: "", p_card_id: 5, p_tag: "trading" }),
    );
  });

  it("attaches a catalog card as Looking for", async () => {
    rows = [{ id: 5, number: 5, name: "Hero Five", native_name: null, image_url: null, rarity: "epic", pow: 1, aura: 1, series: { title: "Skyline" } }];
    rpc.mockImplementation(async (fn: string) => (fn === "send_dm" ? { data: 12, error: null } : { data: null, error: null }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Attach a card" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Looking for" }));
    fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "hero" } });
    fireEvent.click(await screen.findByRole("button", { name: /Hero Five/ }));
    expect(screen.getByText("LOOKING FOR")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("send_dm", { p_username: "sakura", p_body: "", p_card_id: 5, p_tag: "looking" }),
    );
  });

  it("refetches after a reconnect and merges without duplicates", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "dm_thread"
        ? { data: [msg(1), msg(2, { mine: true, fromId: "me", body: "mine 2" }), msg(3, { body: "missed 3" })], error: null }
        : { data: null, error: null },
    );
    view();
    await waitFor(() => expect(statuses).toHaveLength(2));
    await act(async () => statuses.forEach((cb) => cb("SUBSCRIBED")));
    expect(await screen.findByText("missed 3")).toBeInTheDocument();
    expect(screen.getAllByText("hello 1")).toHaveLength(1);
  });

  it("fills a reconnect gap larger than one page, once each and in order", async () => {
    const all = Array.from({ length: 130 }, (_, i) => msg(i + 1, { body: `m${i + 1}` }));
    rpc.mockImplementation(async (fn: string, args: { p_before: number | null; p_limit: number }) => {
      if (fn !== "dm_thread") return { data: null, error: null };
      const pool = args.p_before === null ? all : all.filter((m) => m.id < args.p_before!);
      return { data: pool.slice(-args.p_limit), error: null };
    });
    wrap(<DmThread username="sakura" playerId="me" otherId="u2" initial={all.slice(0, 10)} initialHasMore={false} canSend />);
    await waitFor(() => expect(statuses).toHaveLength(2));
    await act(async () => statuses.forEach((cb) => cb("SUBSCRIBED")));
    expect(await screen.findByText("m130")).toBeInTheDocument();
    const texts = screen.getAllByText(/^m[0-9]+$/).map((e) => e.textContent);
    expect(texts).toEqual(all.map((m) => m.body));
  });

  it("loads older messages with p_before", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "dm_thread" ? { data: [msg(1, { body: "old one" })], error: null } : { data: null, error: null },
    );
    wrap(<DmThread username="sakura" playerId="me" otherId="u2" initial={[msg(5), msg(6)]} initialHasMore canSend />);
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(await screen.findByText("old one")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("dm_thread", { p_username: "sakura", p_before: 5, p_limit: 50 });
  });

  it("hides the composer when you are not friends", () => {
    view([msg(1)], false);
    expect(screen.queryByLabelText("Write a message")).toBeNull();
    expect(screen.getByText(/not friends with sakura/)).toBeInTheDocument();
  });
});

describe("CardAttachment", () => {
  it("shows the tag, the missing badge and a propose-trade link on others' messages", () => {
    wrap(<CardAttachment card={card} tag="trading" missing from="sakura" mine={false} />);
    expect(screen.getByText("TRADING")).toBeInTheDocument();
    expect(screen.getByText("You're missing it")).toBeInTheDocument();
    expect(screen.getByText("Hero Five")).toBeInTheDocument();
    expect(screen.getByText("Skyline")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Propose a trade" })).toHaveAttribute(
      "href",
      "/market?tab=trades&to=sakura&want=5",
    );
  });

  it("looking-for links with give; own messages have no link", () => {
    const { unmount } = wrap(<CardAttachment card={card} tag="looking" from="sakura" mine={false} />);
    expect(screen.getByText("LOOKING FOR")).toBeInTheDocument();
    expect(screen.queryByText("You're missing it")).toBeNull();
    expect(screen.getByRole("link", { name: "Propose a trade" })).toHaveAttribute(
      "href",
      "/market?tab=trades&to=sakura&give=5",
    );
    unmount();
    wrap(<CardAttachment card={card} tag="looking" missing from="me" mine />);
    expect(screen.queryByRole("link", { name: "Propose a trade" })).toBeNull();
  });
});
