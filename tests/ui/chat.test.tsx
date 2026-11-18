import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardAttachment } from "@/components/social/CardAttachment";
import { ChatPanel } from "@/components/social/ChatPanel";
import type { ChatMessage, ChatRow, ProfileCard } from "@/lib/social/types";
import messages from "../../messages/en.json";

const rpc = vi.fn();
type Handler = (p: { new: ChatRow }) => void;
const handlers: Handler[] = [];
const filters: (string | undefined)[] = [];
const statuses: ((s: string) => void)[] = [];
const chan: {
  on: (t: string, o: { filter?: string }, cb: Handler) => unknown;
  subscribe: (cb: (s: string) => void) => unknown;
} = {
  on: (_t, o, cb) => {
    filters.push(o.filter);
    handlers.push(cb);
    return chan;
  },
  subscribe: (cb) => {
    statuses.push(cb);
    cb("SUBSCRIBED");
    return chan;
  },
};
// every query method returns the same chain; awaiting it yields the rows of the table asked for
let tables: Record<string, unknown[]> = {};
function from(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gt", "eq", "ilike", "order", "limit", "range"]) q[m] = () => q;
  q.then = (ok: (v: unknown) => unknown) => ok({ data: tables[table] ?? [], error: null });
  return q;
}
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from,
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
const msg = (id: number, o: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  room: "en",
  author: { id: "u2", username: "sakura", avatarUrl: null },
  body: `hello ${id}`,
  card: null,
  tag: null,
  missing: false,
  mine: false,
  createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  ...o,
});

// chat_history by room, chat_message by id, everything else null
function server(history: Record<string, ChatMessage[]>, extra: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn in extra) return extra[fn];
    if (fn === "chat_history") return { data: history[args.p_room as string] ?? [], error: null };
    if (fn === "chat_message") {
      const all = Object.values(history).flat();
      return { data: all.find((m) => m.id === args.p_id) ?? null, error: null };
    }
    return { data: null, error: null };
  });
}

const emit = async (id: number, room = "en") => {
  await waitFor(() => expect(handlers.length).toBeGreaterThan(0));
  await act(async () => handlers[handlers.length - 1]({ new: { id, room, author_id: "u2" } }));
};

beforeEach(() => {
  rpc.mockReset();
  handlers.length = 0;
  filters.length = 0;
  statuses.length = 0;
  tables = { chat_rooms: [{ id: "en" }, { id: "intl" }] };
  try {
    localStorage.clear();
  } catch {
    // none
  }
});
afterEach(() => cleanup());

describe("market chat", () => {
  it("pulses the live dot only with animations on", async () => {
    server({ en: [msg(1)] });
    localStorage.setItem("anicards.prefs", JSON.stringify({ animations: false }));
    const { unmount } = wrap(<ChatPanel playerId="me" />);
    await screen.findByText("hello 1");
    expect(screen.getByText("Live").querySelector("span")).not.toHaveClass("motion-safe:animate-pulse");
    unmount();
    localStorage.setItem("anicards.prefs", JSON.stringify({ animations: true }));
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("hello 1");
    expect(screen.getByText("Live").querySelector("span")).toHaveClass("motion-safe:animate-pulse");
  });

  it("loads the first room, then another room's history when its pill is chosen, and remembers it", async () => {
    server({ en: [msg(1)], intl: [msg(2, { room: "intl", body: "bonjour" })] });
    wrap(<ChatPanel playerId="me" />);
    expect(await screen.findByText("hello 1")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("chat_history", { p_room: "en", p_before: null, p_limit: 50 });
    fireEvent.click(screen.getByRole("tab", { name: "International" }));
    expect(await screen.findByText("bonjour")).toBeInTheDocument();
    expect(screen.queryByText("hello 1")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("chat_history", { p_room: "intl", p_before: null, p_limit: 50 });
    await waitFor(() => expect(filters).toContain("room=eq.intl"));
    expect(localStorage.getItem("anicards.chatRoom")).toBe("intl");
  });

  it("opens in the remembered room", async () => {
    localStorage.setItem("anicards.chatRoom", "intl");
    server({ en: [msg(1)], intl: [msg(2, { room: "intl", body: "bonjour" })] });
    wrap(<ChatPanel playerId="me" />);
    expect(await screen.findByText("bonjour")).toBeInTheDocument();
  });

  it("appends a new realtime message once, hydrated with its author", async () => {
    const fresh = msg(2, { body: "fresh", author: { id: "u3", username: "kai", avatarUrl: null } });
    rpc.mockImplementation(async (fn: string) => ({
      data: fn === "chat_history" ? [msg(1)] : fn === "chat_message" ? fresh : null,
      error: null,
    }));
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("hello 1");
    await emit(2);
    expect(screen.getAllByText("fresh")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "kai" })).toHaveAttribute("href", "/profile/kai");
    // a duplicate event changes nothing
    await emit(2);
    expect(screen.getAllByText("fresh")).toHaveLength(1);
    expect(rpc.mock.calls.filter((c) => c[0] === "chat_message")).toHaveLength(1);
  });

  it("shows my message at once as pending; the realtime echo and the result render it once", async () => {
    let resolve!: (v: unknown) => void;
    const mine = msg(9, { body: "ping", mine: true, author: { id: "me", username: "me", avatarUrl: null } });
    rpc.mockImplementation((fn: string) => {
      if (fn === "send_chat_message") return new Promise((r) => (resolve = r));
      if (fn === "chat_message") return Promise.resolve({ data: mine, error: null });
      return Promise.resolve({ data: fn === "chat_history" ? [] : null, error: null });
    });
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("Quiet in here. Say hello!");
    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "ping" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("ping").closest("[data-pending]")).not.toBeNull();
    expect(rpc).toHaveBeenCalledWith("send_chat_message", { p_room: "en", p_body: "ping", p_card_id: null, p_tag: null });
    // echo first, then the RPC result
    await emit(9);
    await act(async () => resolve({ data: 9, error: null }));
    expect(screen.getAllByText("ping")).toHaveLength(1);
    expect(screen.getByText("ping").closest("[data-pending]")).toBeNull();
    await emit(9);
    expect(screen.getAllByText("ping")).toHaveLength(1);
  });

  it("renders once when the result arrives before the echo", async () => {
    const mine = msg(9, { body: "pong", mine: true, author: { id: "me", username: "me", avatarUrl: null } });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "send_chat_message") return { data: 9, error: null };
      if (fn === "chat_message") return { data: mine, error: null };
      return { data: fn === "chat_history" ? [] : null, error: null };
    });
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("Quiet in here. Say hello!");
    fireEvent.change(screen.getByLabelText("Write a message"), { target: { value: "pong" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("pong").closest("[data-pending]")).toBeNull());
    await emit(9);
    expect(screen.getAllByText("pong")).toHaveLength(1);
  });

  it("maps rate_limited, drops the pending message and restores the text", async () => {
    server({ en: [] }, { send_chat_message: { data: null, error: { message: "rate_limited" } } });
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("Quiet in here. Say hello!");
    const box = screen.getByLabelText("Write a message");
    fireEvent.change(box, { target: { value: "spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.rate_limited);
    expect(box).toHaveValue("spam");
    expect(screen.queryByText("spam", { selector: "p" })).toBeNull();
  });

  it("renders HTML in a body as text", async () => {
    const body = "<script>alert(1)</script><b>x</b>";
    server({ en: [msg(1, { body })] });
    const { container } = wrap(<ChatPanel playerId="me" />);
    expect(await screen.findByText(body)).toBeInTheDocument();
    expect(container.querySelector("script, b")).toBeNull();
  });

  it("opens the picker on Looking for with the quick button and on Trading with the other", async () => {
    server({ en: [] });
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("Quiet in here. Say hello!");
    fireEvent.click(screen.getByRole("button", { name: "Looking for…" }));
    expect(within(screen.getByRole("dialog")).getByRole("tab", { name: "Looking for" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Trading…" }));
    expect(within(screen.getByRole("dialog")).getByRole("tab", { name: "Trading (your cards)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("attaches one of my open listings tagged trading", async () => {
    server({ en: [] });
    tables.listings = [
      {
        id: 1,
        cards: { id: 5, number: 5, name: "Hero Five", native_name: null, image_url: null, rarity: "epic", pow: 1, aura: 1, series: { title: "Skyline" } },
      },
    ];
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("Quiet in here. Say hello!");
    fireEvent.click(screen.getByRole("button", { name: "My listing" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hero Five" }));
    expect(screen.getByText("TRADING")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("send_chat_message", { p_room: "en", p_body: "", p_card_id: 5, p_tag: "trading" }),
    );
  });
});

describe("reconnect refetch", () => {
  // the server's room: ids 1..n, paged like chat_history (newest page before p_before, oldest first)
  const serve = (all: ChatMessage[]) =>
    rpc.mockImplementation(async (fn: string, args: { p_before?: number | null; p_limit?: number }) => {
      if (fn !== "chat_history") return { data: null, error: null };
      const older = all.filter((m) => args.p_before == null || m.id < args.p_before);
      return { data: older.slice(-(args.p_limit ?? 50)), error: null };
    });
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));
  const reconnect = async () => {
    await waitFor(() => expect(statuses.length).toBeGreaterThan(0));
    await act(async () => statuses[statuses.length - 1]("SUBSCRIBED"));
  };
  const rendered = () => screen.getAllByText(/^hello [0-9]+$/).map((e) => Number(e.textContent!.slice(6)));

  it("fills a gap longer than one page, each message once and in order", async () => {
    serve(range(1, 10));
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("hello 10");
    serve(range(1, 130));
    await reconnect();
    await screen.findByText("hello 130");
    await waitFor(() => expect(rendered()).toHaveLength(130));
    expect(rendered()).toEqual(range(1, 130).map((m) => m.id));
  });

  it("does not duplicate messages the refetch overlaps", async () => {
    serve(range(1, 60));
    wrap(<ChatPanel playerId="me" />);
    await screen.findByText("hello 60");
    serve(range(1, 75));
    await reconnect();
    await screen.findByText("hello 75");
    expect(rendered()).toEqual(range(11, 75).map((m) => m.id));
  });
});

describe("Propose a trade link", () => {
  const link = (tag: "trading" | "looking") => {
    wrap(<CardAttachment card={card} tag={tag} from="sakura" mine={false} />);
    return screen.getByRole("link", { name: "Propose a trade" });
  };
  it("asks for the card when the author is trading it", () => {
    expect(link("trading")).toHaveAttribute("href", "/market?tab=trades&to=sakura&want=5");
  });
  it("offers the card when the author is looking for it", () => {
    expect(link("looking")).toHaveAttribute("href", "/market?tab=trades&to=sakura&give=5");
  });
});
