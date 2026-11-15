import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningScreen, type OpeningPack } from "@/components/opening/OpeningScreen";
import type { Status } from "@/lib/game/types";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const inFn = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({
    rpc,
    from: () => ({ select: () => ({ in: inFn }) }),
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const KEY = "anicards.prefs";

const pack: OpeningPack = { id: "mix", kind: "free", price: null, fallbackPrice: 150 };
const status = (o: Partial<Status> = {}): Status => ({
  freeStock: 2,
  nextFreeAt: null,
  currency: 1000,
  untilGolden: 4,
  untilPity: 120,
  dailyOpenedToday: false,
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

function wrap(s: Status = status()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OpeningScreen pack={pack} status={s} total={100} />
    </NextIntlClientProvider>,
  );
}

const openButton = () => screen.getByRole("button", { name: /^(Open|Free|\d+ free)/ });

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
  inFn.mockReset();
  inFn.mockResolvedValue({ data: cardRows, error: null });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OpeningScreen", () => {
  it("labels a free open with the stock left", () => {
    wrap();
    expect(openButton()).toHaveTextContent("Free · 2 left");
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
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 5 });
    expect(screen.queryByTestId("reveal-placeholder")).toBeNull();

    await act(async () => resolve({ data: rows, error: null }));
    expect(await screen.findByTestId("reveal-placeholder")).toBeInTheDocument();
    expect(screen.getByText("Placeholder Hero")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("opens immediately when the open is fully free", async () => {
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(openButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 1 });
    expect(await screen.findByTestId("reveal-placeholder")).toBeInTheDocument();
  });

  it("with warnPaid off a paid open calls immediately", async () => {
    localStorage.setItem(KEY, JSON.stringify({ warnPaid: false }));
    rpc.mockResolvedValue({ data: rows, error: null });
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "×5" }));
    fireEvent.click(openButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("open_packs", { p_pack: "mix", p_count: 5 });
    expect(await screen.findByTestId("reveal-placeholder")).toBeInTheDocument();
  });

  it("shows RPC errors and no reveal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "insufficient_currency" } });
    wrap();
    fireEvent.click(openButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.errors.insufficient_currency,
    );
    expect(screen.queryByTestId("reveal-placeholder")).toBeNull();
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
});
