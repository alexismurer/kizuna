import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh, replace, push: vi.fn() }),
}));

import { TradesTab } from "@/components/market/TradesTab";
import { parseTradePrefill } from "@/lib/market/filters";
import { parseTrades } from "@/lib/market/trades";
import type { Trade, Tradable } from "@/lib/market/types";

const brief = (id: number) => ({ id, number: id, name: `Card ${id}`, imageUrl: null, rarity: "rare" as const });
const tradable = (id: number, free: number): Tradable => ({ card: brief(id), free, series: "Series" });
const trade = (id: number, o: Partial<Trade> = {}): Trade => ({
  id,
  direction: "received",
  status: "open",
  other: { id: "p2", username: "player2" },
  giveCurrency: 0,
  wantCurrency: 0,
  give: [{ card: brief(5), count: 1 }],
  want: [{ card: brief(1), count: 1 }],
  createdAt: "2026-11-16T10:00:00Z",
  expiresAt: new Date(Date.now() + 47 * 3600_000).toISOString(),
  closedAt: null,
  ...o,
});
const mine = [tradable(1, 3), tradable(2, 1)];
const theirs = [
  { card_id: 9, free: 2, name: "Card 9", number: 9, image_url: null, rarity: "epic", series_title: "Series" },
  { card_id: 8, free: 1, name: "Card 8", number: 8, image_url: null, rarity: "rare", series_title: "Series" },
];

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// past the 200-row browse list: only found by its id
const deep = { card_id: 42, free: 1, name: "Card 42", number: 42, image_url: null, rarity: "common", series_title: "Series" };

function server(overrides: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (name: string, args?: { p_card_id?: number | null }) => {
    if (name in overrides) return overrides[name];
    if (name === "find_players") return { data: [{ id: "p2", username: "player2" }], error: null };
    if (name === "player_tradable_cards" && args?.p_card_id != null)
      return { data: [...theirs, deep].filter((r) => r.card_id === args.p_card_id), error: null };
    if (name === "player_tradable_cards") return { data: theirs, error: null };
    return { data: null, error: null };
  });
}

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
  replace.mockReset();
  server();
});

const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);

describe("parseTrades", () => {
  it("maps my_trades rows", () => {
    const [t] = parseTrades([
      {
        id: 4,
        direction: "sent",
        status: "open",
        other: { id: "p2", username: "player2" },
        give_currency: 10,
        want_currency: 0,
        give: [{ card_id: 1, count: 2, name: "Card 1", number: 1, image_url: null, rarity: "rare" }],
        want: [],
        created_at: "a",
        expires_at: "b",
        closed_at: null,
      },
    ]);
    expect(t).toEqual({
      id: 4,
      direction: "sent",
      status: "open",
      other: { id: "p2", username: "player2" },
      giveCurrency: 10,
      wantCurrency: 0,
      give: [{ card: brief(1), count: 2 }],
      want: [],
      createdAt: "a",
      expiresAt: "b",
      closedAt: null,
    });
  });
});

describe("TradesTab", () => {
  it("lists received and sent offers from my point of view", () => {
    wrap(
      <TradesTab
        trades={[trade(1, { giveCurrency: 30 }), trade(2, { direction: "sent", other: { id: "p3", username: "kai" } })]}
        currency={1000}
        mine={mine}
        prefill={null}
      />,
    );
    const [item] = screen.getAllByRole("listitem");
    expect(item).toHaveTextContent("From player2");
    // received: their give is what I get
    expect(within(item).getByRole("group", { name: "You get" })).toHaveTextContent("Card 5");
    expect(within(item).getByRole("group", { name: "You get" })).toHaveTextContent("30");
    expect(within(item).getByRole("group", { name: "You give" })).toHaveTextContent("Card 1");
    expect(item).toHaveTextContent(/Expires in 2 days/);

    fireEvent.click(screen.getByRole("button", { name: /Sent/ }));
    const [sent] = screen.getAllByRole("listitem");
    expect(sent).toHaveTextContent("To kai");
    expect(within(sent).getByRole("group", { name: "You give" })).toHaveTextContent("Card 5");
    expect(within(sent).getByRole("button", { name: "Cancel offer" })).toBeInTheDocument();
  });

  it("Accept asks for confirmation with what I give and get, then calls accept_trade once", async () => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => (resolve = r)));
    wrap(<TradesTab trades={[trade(7, { giveCurrency: 30 })]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(rpc).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Accept the offer from player2?" });
    expect(within(dialog).getByRole("group", { name: "You give" })).toHaveTextContent("Card 1");
    expect(within(dialog).getByRole("group", { name: "You get" })).toHaveTextContent("Card 5");
    expect(within(dialog).getByRole("group", { name: "You get" })).toHaveTextContent("30");
    const confirm = within(dialog).getByRole("button", { name: messages.market.trades.confirm.confirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    resolve({ data: null, error: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Trade with player2 done.");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("accept_trade", { p_id: 7 });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("backing out of the Accept confirmation calls nothing", () => {
    wrap(<TradesTab trades={[trade(7)]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: messages.market.trades.confirm.back }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Decline", "decline_trade", "Offer from player2 declined."],
  ])("%s calls %s once, then toasts and refreshes", async (label, fn, toast) => {
    let resolve: (v: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => (resolve = r)));
    wrap(<TradesTab trades={[trade(7)]} currency={1000} mine={mine} prefill={null} />);
    const button = screen.getByRole("button", { name: label });
    fireEvent.click(button);
    fireEvent.click(button);
    resolve({ data: null, error: null });
    expect(await screen.findByRole("status")).toHaveTextContent(toast);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(fn, { p_id: 7 });
    expect(refresh).toHaveBeenCalled();
  });

  it("cancel calls cancel_trade once", async () => {
    wrap(<TradesTab trades={[trade(3, { direction: "sent" })]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Sent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel offer" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Offer to player2 cancelled.");
    expect(calls("cancel_trade")).toEqual([["cancel_trade", { p_id: 3 }]]);
  });

  it("maps errors and refreshes when the offer is gone", async () => {
    server({ accept_trade: { data: null, error: { message: "trade_expired" } } });
    wrap(<TradesTab trades={[trade(7)]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: messages.market.trades.confirm.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.trade_expired);
    expect(refresh).toHaveBeenCalled();
  });

  it("can't accept without the asked currency or free copies", () => {
    wrap(
      <TradesTab
        trades={[trade(1, { wantCurrency: 500 }), trade(2, { want: [{ card: brief(2), count: 2 }] })]}
        currency={100}
        mine={mine}
        prefill={null}
      />,
    );
    const [a, b] = screen.getAllByRole("listitem");
    expect(within(a).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(a).toHaveTextContent("You need 500 to accept.");
    expect(within(b).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(b).toHaveTextContent(messages.market.trades.needCards);
  });
});

describe("TradeComposer", () => {
  async function pickPlayer() {
    fireEvent.click(screen.getByRole("button", { name: "New offer" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Player" }), { target: { value: "play" } });
    fireEvent.click(await screen.findByRole("button", { name: "player2" }));
    return within(await screen.findByRole("region", { name: "You ask for" })).findByRole("button", {
      name: "Add Card 9",
    });
  }

  it("builds the exact propose_trade payload from the selections", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={null} />);
    const addTheirs = await pickPlayer();
    expect(calls("find_players")).toEqual([["find_players", { p_query: "play" }]]);
    expect(calls("player_tradable_cards")[0]).toEqual(["player_tradable_cards", { p_player: "p2", p_query: null }]);

    const give = screen.getByRole("region", { name: "You give" });
    fireEvent.click(within(give).getByRole("button", { name: "Add Card 1" }));
    const more = within(give).getByRole("button", { name: "One more Card 1" });
    fireEvent.click(more);
    fireEvent.click(more);
    // bounded by the 3 free copies
    expect(more).toBeDisabled();
    fireEvent.click(within(give).getByRole("button", { name: "One fewer Card 1" }));
    fireEvent.change(within(give).getByRole("spinbutton"), { target: { value: "50" } });

    fireEvent.click(addTheirs);
    const want = screen.getByRole("region", { name: "You ask for" });
    fireEvent.change(within(want).getByRole("spinbutton"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Offer sent to player2.");
    expect(calls("propose_trade")).toEqual([
      [
        "propose_trade",
        {
          p_to: "p2",
          p_give: [{ card_id: 1, count: 2 }],
          p_give_currency: 50,
          p_want: [{ card_id: 9, count: 1 }],
          p_want_currency: 5,
        },
      ],
    ]);
    expect(refresh).toHaveBeenCalled();
  });

  it("can't submit with an empty side or more currency than the balance", async () => {
    wrap(<TradesTab trades={[]} currency={100} mine={mine} prefill={null} />);
    const addTheirs = await pickPlayer();
    const send = screen.getByRole("button", { name: "Send offer" });
    expect(send).toBeDisabled();
    fireEvent.click(addTheirs);
    // my side still empty
    expect(send).toBeDisabled();
    expect(screen.getByText(messages.market.trades.composer.emptySide)).toBeInTheDocument();
    const give = screen.getByRole("region", { name: "You give" });
    fireEvent.change(within(give).getByRole("spinbutton"), { target: { value: "101" } });
    expect(send).toBeDisabled();
    fireEvent.change(within(give).getByRole("spinbutton"), { target: { value: "100" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await screen.findByRole("status");
    expect(calls("propose_trade")[0][1]).toMatchObject({ p_give: [], p_give_currency: 100 });
  });

  it("prefills the player and the wanted card from the URL, looked up by its id", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={{ toUsername: "Player2", wantCardId: 42 }} />);
    const want = await screen.findByRole("region", { name: "You ask for" });
    expect(await within(want).findByRole("button", { name: "Remove Card 42" })).toBeInTheDocument();
    expect(calls("player_tradable_cards")).toContainEqual([
      "player_tradable_cards",
      { p_player: "p2", p_query: null, p_card_id: 42 },
    ]);
    expect(calls("find_players")).toEqual([["find_players", { p_query: "Player2" }]]);
    expect(screen.getByRole("dialog")).toHaveTextContent("player2");
  });

  it("notes when the prefilled card isn't tradable", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={{ toUsername: "player2", wantCardId: 77 }} />);
    expect(await screen.findByText("player2 has no free copy of that card.")).toBeInTheDocument();
  });

  it("notes when the prefilled player doesn't exist", async () => {
    server({ find_players: { data: [{ id: "p4", username: "player20" }], error: null } });
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={{ toUsername: "player2", wantCardId: 8 }} />);
    expect(await screen.findByText("No player named player2.")).toBeInTheDocument();
    expect(calls("player_tradable_cards")).toEqual([]);
  });

  it("searches the other player's cards on the server (any card is reachable)", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={null} />);
    await pickPlayer();
    const want = screen.getByRole("region", { name: "You ask for" });
    fireEvent.change(within(want).getByRole("searchbox", { name: messages.market.trades.composer.searchCards }), {
      target: { value: "Card 42" },
    });
    await waitFor(() =>
      expect(calls("player_tradable_cards")).toContainEqual(["player_tradable_cards", { p_player: "p2", p_query: "Card 42" }]),
    );
  });

  it("maps too_many_trades", async () => {
    server({ propose_trade: { data: null, error: { message: "too_many_trades" } } });
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(await pickPlayer());
    fireEvent.click(within(screen.getByRole("region", { name: "You give" })).getByRole("button", { name: "Add Card 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.too_many_trades);
  });

  it("maps a propose error", async () => {
    server({ propose_trade: { data: null, error: { message: "no_free_copy" } } });
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={null} />);
    fireEvent.click(await pickPlayer());
    fireEvent.click(within(screen.getByRole("region", { name: "You give" })).getByRole("button", { name: "Add Card 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.no_free_copy);
  });
});

describe("parseTradePrefill", () => {
  it("reads to and want from the URL", () => {
    expect(parseTradePrefill({ tab: "trades", to: " player2 ", want: "42" })).toEqual({ toUsername: "player2", wantCardId: 42, giveCardId: null });
    expect(parseTradePrefill({ tab: "trades", to: "player2", want: "x" })).toEqual({ toUsername: "player2", wantCardId: null, giveCardId: null });
    expect(parseTradePrefill({ tab: "trades", want: "42" })).toBeNull();
  });
});

describe("trade prefill from chat", () => {
  const withIntl = (ui: React.ReactNode) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );

  it("reads give from the URL", () => {
    expect(parseTradePrefill({ tab: "trades", to: "player2", give: "2" })).toEqual({
      toUsername: "player2",
      wantCardId: null,
      giveCardId: 2,
    });
  });

  it("prefills the card I give from my free cards", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={{ toUsername: "player2", wantCardId: null, giveCardId: 2 }} />);
    const give = await screen.findByRole("region", { name: "You give" });
    expect(await within(give).findByRole("button", { name: "Remove Card 2" })).toBeInTheDocument();
  });

  it("notes when I have no free copy of the card they look for", async () => {
    wrap(<TradesTab trades={[]} currency={1000} mine={mine} prefill={{ toUsername: "player2", wantCardId: null, giveCardId: 99 }} />);
    expect(await screen.findByText("You have no free copy of the card they are looking for.")).toBeInTheDocument();
  });

  it("applies a new want prefill while mounted, then a new give prefill", async () => {
    const tab = (prefill: Parameters<typeof TradesTab>[0]["prefill"]) => (
      <TradesTab trades={[]} currency={1000} mine={mine} prefill={prefill} />
    );
    const { rerender } = render(withIntl(tab(null)));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(withIntl(tab({ toUsername: "player2", wantCardId: 42, giveCardId: null })));
    const want = await screen.findByRole("region", { name: "You ask for" });
    expect(await within(want).findByRole("button", { name: "Remove Card 42" })).toBeInTheDocument();
    // the URL drops the prefill (composer closed), then a link brings a give prefill
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    rerender(withIntl(tab(null)));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(withIntl(tab({ toUsername: "player2", wantCardId: null, giveCardId: 1 })));
    const give = await screen.findByRole("region", { name: "You give" });
    expect(await within(give).findByRole("button", { name: "Remove Card 1" })).toBeInTheDocument();
  });

  it("a different prefill replaces the one in an open composer; an equal one changes nothing", async () => {
    const tab = (prefill: Parameters<typeof TradesTab>[0]["prefill"]) => (
      <TradesTab trades={[]} currency={1000} mine={mine} prefill={prefill} />
    );
    const { rerender } = render(withIntl(tab({ toUsername: "player2", wantCardId: 42, giveCardId: null })));
    await within(await screen.findByRole("region", { name: "You ask for" })).findByRole("button", { name: "Remove Card 42" });
    rerender(withIntl(tab({ toUsername: "player2", wantCardId: 42, giveCardId: null })));
    expect(calls("find_players")).toHaveLength(1);
    rerender(withIntl(tab({ toUsername: "player2", wantCardId: null, giveCardId: 2 })));
    const give = await screen.findByRole("region", { name: "You give" });
    expect(await within(give).findByRole("button", { name: "Remove Card 2" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "You ask for" })).queryByRole("button", { name: "Remove Card 42" })).toBeNull();
  });
});
