import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningScreen, type OpeningPack } from "@/components/opening/OpeningScreen";
import type { Status } from "@/lib/game/types";
import { STRIP_MS, sequenceMs } from "@/lib/opening/tear";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
const inFn = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from: () => ({ select: () => ({ in: inFn }) }),
  }),
}));

// the booster sheet's packs load on demand; empty here
vi.mock("@/lib/actions/boosterSheet", () => ({
  getSheetBoosters: () => new Promise(() => {}),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const KEY = "anicards.prefs";

const pack: OpeningPack = {
  id: "mix",
  kind: "free",
  price: null,
  fallbackPrice: 150,
  slotFloors: ["common", "common", "common", "common", "rare"],
};
const status = (o: Partial<Status> = {}): Status => ({
  freeStock: 2,
  nextFreeAt: null,
  currency: 1000,
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

const rows = [
  { pack_index: 1, slot: 1, card_id: 7, rarity: "common", is_new: true },
];
const cardRows = [
  {
    id: 7,
    number: 12,
    name: "Placeholder Hero",
    native_name: null,
    image_url: null,
    series_id: 1,
    rarity: "common",
    pow: 10,
    aura: 20,
    series: { title: "Some Series" },
  },
];

function wrap(s: Status = status(), p: OpeningPack = pack) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OpeningScreen pack={p} status={s} total={100} />
    </NextIntlClientProvider>,
  );
}

const chest: OpeningPack = {
  id: "chest",
  kind: "shop",
  price: 550,
  fallbackPrice: null,
  slotFloors: ["common", "common", "common", "common", "rare"],
};

const openButton = () =>
  screen.getByRole("button", { name: /^(Open ·|Open the|Free|Reward|\d+ free)/ });
const packEl = () => screen.getByRole("button", { name: messages.opening.openBooster });

let now = 0;
function hold(ms: number) {
  now = 1000;
  fireEvent.pointerDown(packEl(), { button: 0, pointerId: 1, clientX: 50, clientY: 100 });
  now = 1000 + ms;
  fireEvent.pointerUp(packEl(), { button: 0, pointerId: 1 });
}

beforeEach(() => {
  localStorage.clear();
  // most tests check the flow, not the tear sequence
  localStorage.setItem(KEY, JSON.stringify({ animations: false }));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  rpc.mockReset();
  refresh.mockReset();
  inFn.mockReset();
  inFn.mockResolvedValue({ data: cardRows, error: null });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// animations on, fake timers, open by holding; resolves once the pack is "out"
async function tearWithTimers(before?: () => void) {
  localStorage.setItem(KEY, JSON.stringify({ animations: true }));
  // performance.now stays mocked for the hold
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  wrap(status({ freeStock: 2, currency: 0 }));
  before?.();
  hold(900);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("OpeningScreen", () => {
  it("labels a free open with the stock left", () => {
    wrap();
    expect(openButton()).toHaveTextContent("Free · 2 left");
  });

  it("Change booster opens the booster sheet", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.opening.changeBooster }));
    expect(screen.getByRole("dialog", { name: messages.home.grid.title })).toBeInTheDocument();
  });

  it("keys inside the booster sheet don't open the pack; Esc only closes the sheet", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.opening.changeBooster }));
    const close = screen.getByRole("button", { name: messages.sheet.close });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Enter" });
    fireEvent.keyDown(close, { key: " " });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(openButton()).toHaveTextContent("Free · 2 left");
  });

  it("a granted chest opens ×1 for free without currency", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap(status({ currency: 0, rewardPacks: { chest: 1 } }), chest);
    expect(screen.getByText("Reward ×1")).toBeInTheDocument();
    expect(openButton()).toHaveTextContent("Reward · 1 left");
    expect(openButton()).toBeEnabled();
    fireEvent.click(openButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "chest", p_count: 1, p_max_cost: 0 });
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
  });

  it("uses reward packs first and asks only for the paid ones", () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap(status({ currency: 5000, rewardPacks: { chest: 1 } }), chest);
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    expect(openButton()).toHaveTextContent("1 free + 2200");
    fireEvent.click(openButton());
    expect(screen.getByRole("alertdialog")).toHaveTextContent("4 boosters paid with currency");
    fireEvent.click(screen.getByRole("button", { name: messages.opening.confirm }));
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "chest", p_count: 5, p_max_cost: 2200 });
  });

  it("shows no reward badge without reward packs", () => {
    wrap(status({ rewardPacks: { chest: 1 } }));
    expect(screen.queryByText(/Reward ×/)).toBeNull();
  });

  it("labels a mixed open with free count and cost", () => {
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    expect(openButton()).toHaveTextContent("2 free + 450");
  });

  it("asks before a paid part and does not call the RPC", () => {
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    fireEvent.click(openButton());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: messages.opening.cancel }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Confirm calls open_packs once with (pack, n), before the reveal renders", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: messages.opening.confirm }));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 5, p_max_cost: 450 });
    expect(screen.queryByTestId("reveal-flow")).toBeNull();

    await act(async () => resolve({ data: rows, error: null }));
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    expect(screen.getByTestId("summary")).toBeInTheDocument();
    expect(screen.getByText("Placeholder Hero")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Mix" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("opens immediately when the open is fully free", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(openButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 1, p_max_cost: 0 });
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
  });

  it("with warnPaid off a paid open calls immediately", async () => {
    localStorage.setItem(KEY, JSON.stringify({ animations: false, warnPaid: false }));
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    fireEvent.click(openButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 5, p_max_cost: 450 });
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
  });

  it("shows RPC errors and no reveal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "insufficient_currency" } });
    wrap();
    fireEvent.click(openButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.errors.insufficient_currency,
    );
    expect(screen.queryByTestId("reveal-flow")).toBeNull();
  });

  it("focuses Cancel in the paid confirm, Esc cancels and focus returns to Open", () => {
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    const button = openButton();
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: messages.opening.cancel })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(button).toHaveFocus();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows cost_changed and refreshes the status", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "cost_changed" } });
    wrap();
    fireEvent.click(openButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.cost_changed);
    expect(refresh).toHaveBeenCalled();
  });

  it("says the cards were added when only the card fetch fails", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    inFn.mockResolvedValue({ data: null, error: { message: "boom" } });
    wrap();
    fireEvent.click(openButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.opening.cardsAdded);
    expect(screen.getByRole("link", { name: messages.opening.seeCollection })).toHaveAttribute(
      "href",
      "/collection",
    );
  });

  it("refreshes the status when the window regains focus or becomes visible", () => {
    wrap();
    fireEvent(window, new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent(document, new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("schedules a refresh at nextFreeAt", () => {
    vi.useFakeTimers();
    try {
      const at = new Date(Date.now() + 5000).toISOString();
      wrap(status({ nextFreeAt: at }));
      expect(refresh).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(6000));
      expect(refresh).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the pity line", () => {
    wrap();
    expect(screen.getByText("Mythic guaranteed within 120 boosters")).toBeInTheDocument();
  });

  it("disables Open when nothing can be opened", () => {
    wrap(status({ freeStock: 0, currency: 0 }));
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("button", { name: messages.opening.cantAfford })).toBeDisabled();
  });

  it("shows the card count chip and the gesture hint", () => {
    wrap();
    expect(screen.getByText("5 cards")).toBeInTheDocument();
    expect(screen.getByText(messages.opening.hint)).toBeInTheDocument();
  });

  it("a completed hold opens once", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    hold(820);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 1, p_max_cost: 0 });
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("a hold released early does nothing", () => {
    wrap();
    hold(500);
    expect(rpc).not.toHaveBeenCalled();
    expect(packEl()).toHaveAttribute("data-tear", "sealed");
  });

  it("ignores secondary buttons", () => {
    wrap();
    now = 1000;
    fireEvent.pointerDown(packEl(), { button: 2, pointerId: 1 });
    now = 2000;
    fireEvent.pointerUp(packEl(), { button: 2, pointerId: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a cancelled paid confirm after a hold re-seals the strip", () => {
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    hold(900);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(packEl()).toHaveAttribute("data-tear", "torn");
    fireEvent.click(screen.getByRole("button", { name: messages.opening.cancel }));
    expect(packEl()).toHaveAttribute("data-tear", "sealed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("re-seals the pack when the open fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "insufficient_currency" } });
    wrap();
    hold(900);
    expect(packEl()).toHaveAttribute("data-tear", "torn");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.errors.insufficient_currency,
    );
    expect(packEl()).toHaveAttribute("data-tear", "sealed");
  });

  it("marks only the first copy of a new card as new", async () => {
    rpc.mockResolvedValue({
      data: [
        { pack_index: 1, slot: 1, card_id: 7, rarity: "common", is_new: true },
        { pack_index: 1, slot: 2, card_id: 7, rarity: "common", is_new: true },
      ],
      error: null,
    });
    wrap();
    fireEvent.click(openButton());
    await screen.findByTestId("reveal-flow");
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    expect(screen.getAllByText(messages.reveal.new)).toHaveLength(1);
  });

  it("taps through the reveal to the result list", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(openButton());
    await screen.findByTestId("reveal-flow");
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    expect(screen.getByText("Placeholder Hero", { selector: "h2" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    expect(screen.getByTestId("summary")).toBeInTheDocument();
  });

  it("Open another from the summary goes straight into a fresh reveal", async () => {
    localStorage.setItem(KEY, JSON.stringify({ animations: true }));
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(openButton());
    // the first open plays the tear sequence
    await screen.findByTestId("reveal-flow", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    expect(screen.getByTestId("summary")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open another · Free" }));
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith("open_packs", { p_pack: "mix", p_count: 1, p_max_cost: 0 });
    expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/1");
    expect(screen.queryByRole("button", { name: messages.opening.openBooster })).toBeNull();
  });

  it("Open another asks before a paid booster", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap(status({ freeStock: 0 }));
    fireEvent.click(openButton());
    fireEvent.click(screen.getByRole("button", { name: messages.opening.confirm }));
    await screen.findByTestId("reveal-flow");
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));

    fireEvent.click(screen.getByRole("button", { name: "Open another · 150" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: messages.opening.confirm }));
    });
    expect(rpc).toHaveBeenLastCalledWith("open_packs", { p_pack: "mix", p_count: 1, p_max_cost: 150 });
    expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
  });

  it("keeps the summary and shows the error when Open another fails", async () => {
    rpc.mockResolvedValueOnce({ data: rows, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "no_stock" } });
    wrap();
    fireEvent.click(openButton());
    await screen.findByTestId("reveal-flow");
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open another · Free" }));
    });
    expect(screen.getByTestId("summary")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("tells the player the cards were added when Open another can't load them", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(openButton());
    await screen.findByTestId("reveal-flow");
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    inFn.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open another · Free" }));
    });
    expect(screen.getByTestId("summary")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(messages.opening.cardsAdded);
  });

  it("Enter on the pack opens", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.keyDown(packEl(), { key: "Enter" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("reveal-flow")).toBeInTheDocument();
  });

  describe("with a laid-out pack (200×300)", () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    });

    const down = (x: number, y: number, pointerId = 1) =>
      fireEvent.pointerDown(packEl(), { button: 0, pointerId, clientX: x, clientY: y });
    const move = (x: number, y: number, pointerId = 1) =>
      fireEvent.pointerMove(packEl(), { pointerId, clientX: x, clientY: y });
    const up = (x: number, y: number, pointerId = 1) =>
      fireEvent.pointerUp(packEl(), { button: 0, pointerId, clientX: x, clientY: y });

    it("a hold that moves more than 10 px is cancelled", () => {
      wrap();
      now = 1000;
      down(100, 150);
      move(140, 150);
      now = 1900;
      up(140, 150);
      expect(rpc).not.toHaveBeenCalled();
      expect(packEl()).toHaveAttribute("data-tear", "sealed");
    });

    it("another pointer's release does not end the hold", () => {
      rpc.mockResolvedValue({ data: rows, error: null });
      wrap();
      now = 1000;
      down(100, 150, 1);
      now = 1300;
      up(10, 10, 2);
      now = 1900;
      up(100, 150, 1);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("a tear released past 70 % opens once", () => {
      rpc.mockResolvedValue({ data: rows, error: null });
      wrap();
      down(20, 20);
      move(100, 20);
      move(170, 22);
      expect(rpc).not.toHaveBeenCalled();
      up(170, 22);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("a tear completes as soon as it crosses the whole pack", () => {
      rpc.mockResolvedValue({ data: rows, error: null });
      wrap();
      down(195, 20);
      move(100, 20);
      move(-10, 20);
      expect(rpc).toHaveBeenCalledTimes(1);
      up(-10, 20);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it("a tear released at 50 % does nothing", () => {
      wrap();
      down(20, 20);
      move(120, 20);
      up(120, 20);
      expect(rpc).not.toHaveBeenCalled();
    });

    describe("the daily pouch", () => {
      const daily: OpeningPack = { id: "daily", kind: "daily", price: null, fallbackPrice: null, slotFloors: pack.slotFloors };

      it("asks to pull the cord", () => {
        wrap(status(), daily);
        expect(screen.getByText(messages.opening.hintDaily)).toBeInTheDocument();
        expect(screen.getByTestId("pack-cord")).toBeInTheDocument();
      });

      it("pulling the cord up past its travel opens", () => {
        rpc.mockResolvedValue({ data: rows, error: null });
        wrap(status(), daily);
        down(100, 10);
        move(100, -40);
        expect(rpc).not.toHaveBeenCalled();
        move(100, -100); // travel = 35 % of 300 = 105
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith("open_packs", expect.objectContaining({ p_pack: "daily" }));
      });

      it("a short pull does nothing", () => {
        wrap(status(), daily);
        down(100, 10);
        move(100, -30);
        up(100, -30);
        expect(rpc).not.toHaveBeenCalled();
      });

      it("the Open button still opens", () => {
        rpc.mockResolvedValue({ data: rows, error: null });
        wrap(status(), daily);
        fireEvent.click(screen.getByRole("button", { name: messages.opening.openDaily }));
        expect(rpc).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("a golden ×2 batch", () => {
    const hero = (id: number, rarity: string) => ({
      ...cardRows[0],
      id,
      number: id,
      name: `Hero ${id}`,
      rarity,
    });
    const batch = [
      { pack_index: 1, slot: 1, card_id: 1, rarity: "rare", is_new: false, golden: false, divine: false },
      { pack_index: 1, slot: 2, card_id: 2, rarity: "common", is_new: false, golden: false, divine: false },
      { pack_index: 2, slot: 1, card_id: 3, rarity: "legendary", is_new: false, golden: true, divine: false },
      { pack_index: 2, slot: 2, card_id: 4, rarity: "common", is_new: false, golden: true, divine: false },
    ];
    beforeEach(() => {
      rpc.mockResolvedValue({ data: batch, error: null });
      inFn.mockResolvedValue({
        data: [hero(1, "rare"), hero(2, "common"), hero(3, "legendary"), hero(4, "common")],
        error: null,
      });
    });

    const flipName = () => {
      fireEvent.click(screen.getByTestId("reveal-card"));
      const name = screen.getByRole("heading", { level: 2 }).textContent;
      fireEvent.click(screen.getByTestId("reveal-card"));
      return name;
    };

    it("reveals by rarity ascending, best last, with a Golden chip, and says so in the summary", async () => {
      wrap(status({ freeStock: 2, currency: 0 }));
      fireEvent.click(screen.getByRole("radio", { name: "×2" }));
      fireEvent.click(openButton());
      await screen.findByTestId("reveal-flow");
      expect(screen.getByText(messages.reveal.golden)).toBeInTheDocument();
      expect([flipName(), flipName(), flipName(), flipName()]).toEqual([
        "Hero 4",
        "Hero 2",
        "Hero 1",
        "Hero 3",
      ]);
      expect(screen.getByTestId("summary")).toBeInTheDocument();
      expect(screen.getByText(messages.summary.golden)).toBeInTheDocument();
    });

    it("tears a golden pack: plain with a white beam, then golden with the best rarity's beam", async () => {
      await tearWithTimers(() => fireEvent.click(screen.getByRole("radio", { name: "×2" })));
      expect(packEl()).toHaveAttribute("data-tear", "out");
      // while the strip flies off the pack is plain and the beam white
      expect(packEl()).not.toHaveAttribute("data-special");
      expect(screen.queryByText(messages.opening.golden)).toBeNull();
      expect(screen.getByTestId("pack-beam")).toHaveAttribute("data-color", "white");
      // then it turns golden and the beam takes the best rarity, together
      act(() => vi.advanceTimersByTime(STRIP_MS));
      expect(packEl()).toHaveAttribute("data-special", "golden");
      expect(screen.getAllByText(messages.opening.golden).length).toBeGreaterThan(0);
      expect(screen.getByTestId("pack-beam")).toHaveAttribute("data-color", "legendary");
      expect(screen.getByTestId("pack-tease")).toHaveClass("back-glow-legendary");
    });

    it("rains gold particles during the reveal only", async () => {
      await tearWithTimers(() => fireEvent.click(screen.getByRole("radio", { name: "×2" })));
      expect(screen.getByTestId("fx-top")).not.toHaveAttribute("data-ambient");
      act(() => vi.advanceTimersByTime(sequenceMs("golden")));
      expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
      expect(screen.getByTestId("fx-top")).toHaveAttribute("data-ambient", "golden");
      fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
      expect(screen.getByTestId("fx-top")).not.toHaveAttribute("data-ambient");
    });
  });

  describe("the tear sequence (fake timers)", () => {
    beforeEach(() => rpc.mockResolvedValue({ data: rows, error: null }));

    it("hides the controls while the pack tears out, and cards rise as real card backs", async () => {
      await tearWithTimers();
      act(() => vi.advanceTimersByTime(STRIP_MS + 100));
      const controls = screen.getByTestId("opening-controls");
      expect(controls).toHaveAttribute("inert");
      expect(controls).toHaveClass("invisible");
      expect(within(controls).getByText(messages.opening.hint)).toBeInTheDocument();
      expect(within(screen.getByTestId("pack-tease")).getByRole("img", { name: messages.card.backAlt, hidden: true })).toBeInTheDocument();
    });

    it("a plain pack stays plain with a white beam and no gold particles", async () => {
      await tearWithTimers();
      act(() => vi.advanceTimersByTime(STRIP_MS + 100));
      expect(packEl()).not.toHaveAttribute("data-special");
      expect(screen.queryByText(messages.opening.golden)).toBeNull();
      expect(screen.getByTestId("pack-beam")).toHaveAttribute("data-color", "white");
      expect(screen.getByTestId("pack-tease").className).not.toMatch(/back-glow/);
      act(() => vi.advanceTimersByTime(sequenceMs(null)));
      expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
      expect(screen.getByTestId("fx-top")).not.toHaveAttribute("data-ambient");
    });

    // the skip lands on card 1 face down, and the sequence timer firing later changes nothing
    const skipped = () => {
      expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
      expect(screen.getByTestId("reveal-card")).toHaveAttribute("data-flipped", "false");
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByTestId("reveal-flow")).toBeInTheDocument();
      expect(screen.getByTestId("reveal-card")).toHaveAttribute("data-flipped", "false");
      expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/1");
    };

    it("a tap anywhere on the stage skips to the reveal", async () => {
      await tearWithTimers();
      fireEvent.click(screen.getByRole("main"));
      skipped();
    });

    it("a tap on the pack skips to the reveal", async () => {
      await tearWithTimers();
      fireEvent.click(packEl());
      skipped();
    });

    it("Enter on the pack skips to the reveal without flipping card 1", async () => {
      await tearWithTimers();
      fireEvent.keyDown(packEl(), { key: "Enter" });
      fireEvent.keyUp(window, { key: "Enter" });
      skipped();
    });

    it("Space on the pack skips to the reveal without flipping or fast-forwarding", async () => {
      await tearWithTimers();
      fireEvent.keyDown(packEl(), { key: " ", code: "Space" });
      fireEvent.keyUp(window, { key: " ", code: "Space" });
      skipped();
    });

    it("header buttons still work during the sequence", async () => {
      await tearWithTimers();
      fireEvent.click(screen.getByRole("button", { name: messages.opening.settings }));
      expect(packEl()).toHaveAttribute("data-tear", "out");
    });
  });

  it("with animations on, plays the sequence before the reveal", async () => {
    localStorage.setItem(KEY, JSON.stringify({ animations: true }));
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    hold(900);
    await waitFor(() => expect(packEl()).toHaveAttribute("data-tear", "out"));
    expect(screen.queryByTestId("reveal-flow")).toBeNull();
    expect(
      await screen.findByTestId("reveal-flow", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
