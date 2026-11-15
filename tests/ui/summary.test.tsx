import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RevealCard } from "@/components/opening/RevealFlow";
import { Summary } from "@/components/opening/Summary";
import type { Rarity } from "@/lib/game/types";
import messages from "../../messages/en.json";

const toPng = vi.fn();
vi.mock("html-to-image", () => ({ toPng: (...a: unknown[]) => toPng(...a) }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const make = (id: number, rarity: Rarity, isNew = false, packIndex = 1): RevealCard => ({
  rarity,
  isNew,
  packIndex,
  card: {
    number: id,
    total: 100,
    name: `Hero ${id}`,
    nativeName: null,
    imageUrl: null,
    seriesTitle: "Some Series",
    rarity,
    pow: 10,
    aura: 20,
  },
});

const pull = [
  make(1, "common", true),
  make(9, "rare"),
  make(5, "mythic", true),
  make(3, "rare"),
  make(2, "uncommon"),
];

function wrap(props: Partial<React.ComponentProps<typeof Summary>> = {}) {
  const onOpenAgain = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Summary
        packName="Mix"
        cards={pull}
        packCount={1}
        quantityOptions={[1, 5]}
        quantity={1}
        onQuantity={() => {}}
        openLabel="Open another · 150"
        busy={false}
        onOpenAgain={onOpenAgain}
        collectionHref="/collection"
        animations={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onOpenAgain;
}

beforeEach(() => {
  toPng.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Summary", () => {
  it("shows the pack name, the new count and labels the best card", () => {
    wrap();
    expect(screen.getByRole("heading", { name: "Mix" })).toBeInTheDocument();
    expect(screen.getByText("2 new cards")).toBeInTheDocument();
    const best = screen.getByTestId("summary-best");
    expect(within(best).getByText(messages.summary.best)).toBeInTheDocument();
    expect(within(best).getByText("Hero 5")).toBeInTheDocument();
    expect(screen.getAllByText(messages.summary.best)).toHaveLength(1);
  });

  it("puts the best card in the middle of the arc", () => {
    wrap();
    const slots = screen.getAllByTestId(/^summary-(card|best)$/);
    expect(slots).toHaveLength(5);
    expect(slots[2]).toBe(screen.getByTestId("summary-best"));
  });

  it("sorts a multi-pack grid by rarity, then number, best first", () => {
    wrap({
      packCount: 2,
      cards: [...pull, make(4, "rare", false, 2), make(8, "epic", false, 2)],
    });
    const names = screen
      .getAllByTestId(/^summary-(card|best)$/)
      .map((el) => el.querySelector(".font-display")?.textContent);
    expect(names).toEqual(["Hero 5", "Hero 8", "Hero 3", "Hero 4", "Hero 9", "Hero 2", "Hero 1"]);
  });

  it("focuses Open another when it mounts", () => {
    wrap();
    expect(screen.getByRole("button", { name: "Open another · 150" })).toHaveFocus();
  });

  it("focuses the title when Open another is hidden", () => {
    wrap({ quantityOptions: [], quantity: 0 });
    expect(screen.getByRole("heading", { name: "Mix" })).toHaveFocus();
  });

  it("opens another with the chosen quantity", () => {
    const onOpenAgain = wrap({ quantity: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Open another · 150" }));
    expect(onOpenAgain).toHaveBeenCalledWith(5);
  });

  it("hides Open another when nothing can be opened", () => {
    wrap({ quantityOptions: [], quantity: 0 });
    expect(screen.queryByRole("button", { name: /Open another/ })).toBeNull();
    expect(screen.getByRole("link", { name: messages.summary.collection })).toHaveAttribute(
      "href",
      "/collection",
    );
    expect(screen.getByRole("link", { name: messages.summary.change })).toHaveAttribute("href", "/");
  });

  it("copies the page URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.summary.copy }));
    expect(writeText).toHaveBeenCalledWith(location.href);
    expect(await screen.findByText(messages.summary.copied)).toBeInTheDocument();
  });

  it("shows the URL when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.summary.copy }));
    expect(await screen.findByText(location.href)).toBeInTheDocument();
  });

  it("downloads a PNG of the summary", async () => {
    toPng.mockResolvedValue("data:image/png;base64,AAAA");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.summary.image }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const [node, opts] = toPng.mock.calls[0];
    expect(node).toBe(screen.getByTestId("summary-capture"));
    expect(opts).toMatchObject({ pixelRatio: 2 });
    expect(opts.imagePlaceholder).toMatch(/^data:image\//);
    // a plain cached copy has no CORS headers: html-to-image must refetch
    expect(opts.fetchRequestInit).toEqual({ cache: "no-store" });
    const a = click.mock.contexts[0] as HTMLAnchorElement;
    expect(a.download).toBe("anicards-pull.png");
    expect(a.href).toBe("data:image/png;base64,AAAA");
  });

  it("shows an error when the image cannot be made", async () => {
    toPng.mockRejectedValue(new Error("tainted"));
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.summary.image }));
    expect(await screen.findByText(messages.summary.imageError)).toBeInTheDocument();
  });
});
