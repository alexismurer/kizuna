import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevealFlow, type RevealCard } from "@/components/opening/RevealFlow";
import type { Rarity } from "@/lib/game/types";
import messages from "../../messages/en.json";

const make = (id: number, rarity: Rarity, packIndex = 1, isNew = false): RevealCard => ({
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

const cards = [make(1, "common"), make(2, "rare", 1, true)];

function wrap(props: Partial<React.ComponentProps<typeof RevealFlow>> = {}) {
  const onDone = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RevealFlow
        cards={cards}
        packCount={1}
        onDone={onDone}
        animations={false}
        sound={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onDone;
}

const card = () => screen.getByTestId("reveal-card");
const space = (type: "keyDown" | "keyUp" = "keyDown", repeat = false) =>
  fireEvent[type](window, { key: " ", code: "Space", repeat });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RevealFlow", () => {
  it("shows the counter and a face-down card first", () => {
    wrap();
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/2");
    expect(screen.getByRole("img", { name: messages.card.backAlt })).toBeInTheDocument();
    expect(screen.queryByText("Hero 1", { selector: "h2" })).toBeNull();
    expect(screen.getByText(messages.reveal.tapToFlip)).toBeInTheDocument();
  });

  it("Space flips the card, then moves to the next one", () => {
    wrap();
    space();
    space("keyUp");
    expect(card()).toHaveAttribute("data-flipped", "true");
    expect(screen.getByText("Hero 1", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText(messages.rarity.common)).toBeInTheDocument();
    expect(screen.getByText(messages.reveal.next)).toBeInTheDocument();
    expect(screen.getAllByTestId("slot")[0]).toHaveAttribute("data-filled", "true");
    space();
    space("keyUp");
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("2/2");
    expect(card()).toHaveAttribute("data-flipped", "false");
  });

  it("Enter and ArrowRight also tap", () => {
    wrap();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(card()).toHaveAttribute("data-flipped", "true");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("2/2");
  });

  it("a Rare card shows its glowing back before the flip", () => {
    wrap();
    space();
    space("keyUp");
    space();
    space("keyUp");
    expect(screen.getByRole("img", { name: messages.card.backAlt })).toHaveClass(
      "back-glow-rare",
    );
  });

  it("a Common card's back does not glow", () => {
    wrap();
    expect(screen.getByRole("img", { name: messages.card.backAlt }).className).not.toMatch(
      /back-glow/,
    );
  });

  it("marks new cards", () => {
    wrap({ cards: [make(2, "rare", 1, true)] });
    fireEvent.click(card());
    expect(screen.getByText(messages.reveal.new)).toBeInTheDocument();
  });

  it("Reveal all calls onDone", () => {
    const onDone = wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Space on a focused button is left to the button", () => {
    wrap();
    const button = screen.getByRole("button", { name: messages.reveal.revealAll });
    button.focus();
    fireEvent.keyDown(button, { key: " ", code: "Space" });
    expect(card()).toHaveAttribute("data-flipped", "false");
  });

  it("with animations off, taps alone reach the end (no timers)", () => {
    const onDone = wrap();
    for (let i = 0; i < 3; i++) fireEvent.click(card());
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(card());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a swipe of 40 px or more taps once, a small one does nothing", () => {
    wrap();
    const stage = screen.getByTestId("reveal-stage");
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 180, clientY: 300 });
    fireEvent.click(stage); // the browser's click after a short drag is not a tap
    expect(card()).toHaveAttribute("data-flipped", "false");
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 200, clientY: 250 });
    fireEvent.click(card());
    expect(card()).toHaveAttribute("data-flipped", "true");
  });

  it("holding Space fast-forwards every 150 ms after 300 ms", () => {
    vi.useFakeTimers();
    const onDone = wrap({ cards: [make(1, "common"), make(2, "rare"), make(3, "common")] });
    space(); // tap: flip card 1
    expect(card()).toHaveAttribute("data-flipped", "true");
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/3");
    space("keyDown", true); // key repeat is ignored
    act(() => vi.advanceTimersByTime(1)); // 300 ms: fast forward starts
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("2/3");
    expect(card()).toHaveAttribute("data-flipped", "true");
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("3/3");
    space("keyUp");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("3/3");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("focuses the card on mount and after each advance", () => {
    wrap();
    expect(card()).toHaveFocus();
    fireEvent.click(card());
    fireEvent.click(card());
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("2/2");
    expect(card()).toHaveFocus();
  });

  it("Escape reveals all", () => {
    const onDone = wrap();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ignores an Escape another control already handled", () => {
    const onDone = wrap();
    const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("hides the back face from assistive tech once flipped", () => {
    wrap();
    fireEvent.click(card());
    expect(screen.queryByRole("img", { name: messages.card.backAlt })).toBeNull();
  });

  it("shows up to three cards left in the stack, fewer as it empties", () => {
    wrap({ cards: [1, 2, 3, 4, 5].map((i) => make(i, "common")) });
    expect(screen.getAllByTestId("reveal-stack")).toHaveLength(3);
    for (let i = 0; i < 6; i++) fireEvent.click(card()); // to card 4 of 5
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("4/5");
    expect(screen.getAllByTestId("reveal-stack")).toHaveLength(1);
    fireEvent.click(card());
    fireEvent.click(card());
    expect(screen.queryAllByTestId("reveal-stack")).toHaveLength(0);
  });

  it("shakes a wrapper, not the card that slid in", () => {
    wrap({ cards: [make(1, "legendary")], animations: true });
    fireEvent.click(card());
    expect(card()).toHaveClass("reveal-in");
    expect(card()).not.toHaveClass("reveal-shake");
    expect(card().parentElement).toHaveClass("reveal-shake");
  });

  it("shows one slot per card and the current card's booster for a multi-open", () => {
    wrap({
      cards: [make(1, "common", 1), make(3, "common", 2), make(2, "rare", 1)],
      packCount: 2,
    });
    expect(screen.getAllByTestId("slot")).toHaveLength(3);
    expect(screen.getByText("Booster 1/2")).toBeInTheDocument();
    fireEvent.click(card());
    fireEvent.click(card());
    expect(screen.getByText("Booster 2/2")).toBeInTheDocument();
  });

  describe("skip to the next Epic or better", () => {
    const skip = () => screen.queryByRole("button", { name: messages.reveal.skipEpic });
    const batch = [make(1, "common"), make(2, "rare"), make(3, "epic"), make(4, "legendary")];

    it("jumps to the next Epic+ card face down, then to the next one", () => {
      wrap({ cards: batch });
      fireEvent.click(skip()!);
      expect(screen.getByTestId("reveal-counter")).toHaveTextContent("3/4");
      expect(card()).toHaveAttribute("data-flipped", "false");
      expect(screen.getByRole("img", { name: messages.card.backAlt })).toHaveClass("back-glow-epic");
      // the current card is the next Epic+: nothing to skip
      expect(skip()).toBeNull();
      fireEvent.click(card());
      fireEvent.click(skip()!);
      expect(screen.getByTestId("reveal-counter")).toHaveTextContent("4/4");
      expect(skip()).toBeNull();
    });

    it("is hidden when no Epic+ card is left", () => {
      wrap({ cards: [make(1, "common"), make(2, "rare")] });
      expect(skip()).toBeNull();
      expect(screen.getByRole("button", { name: messages.reveal.revealAll })).toBeInTheDocument();
    });
  });

  it("shows a Golden chip next to the counter for a golden batch", () => {
    wrap({ golden: true });
    expect(screen.getByText(messages.reveal.golden)).toBeInTheDocument();
    expect(screen.queryByText(messages.reveal.divine)).toBeNull();
  });

  it("shows a Divine chip for a divine batch", () => {
    wrap({ divine: true });
    expect(screen.getByText(messages.reveal.divine)).toBeInTheDocument();
  });

  it("shows no chip for a plain batch", () => {
    wrap();
    expect(screen.queryByText(messages.reveal.golden)).toBeNull();
    expect(screen.queryByText(messages.reveal.divine)).toBeNull();
  });

  it("bursts and shockwaves an Epic+ card on the flip and tints the page", () => {
    const onBurst = vi.fn();
    wrap({ cards: [make(1, "epic")], animations: true, onBurst });
    expect(screen.queryByTestId("reveal-shockwave")).toBeNull();
    fireEvent.click(card());
    expect(screen.getByTestId("reveal-shockwave")).toBeInTheDocument();
    expect(screen.getByTestId("reveal-burst")).toBeInTheDocument();
    expect(onBurst).toHaveBeenCalledWith(expect.objectContaining({ kind: "flip", tone: "epic" }));
    expect(screen.getByTestId("reveal-tint").getAttribute("style")).toContain("var(--color-epic)");
  });

  it("no burst or shockwave with animations off or below Epic", () => {
    const onBurst = vi.fn();
    wrap({ cards: [make(1, "epic")], onBurst });
    fireEvent.click(card());
    expect(screen.queryByTestId("reveal-shockwave")).toBeNull();
    expect(screen.queryByTestId("reveal-burst")).toBeNull();
    expect(onBurst).not.toHaveBeenCalled();
    // the tint stays, without motion
    expect(screen.getByTestId("reveal-tint").getAttribute("style")).toContain("var(--color-epic)");
    cleanup();
    wrap({ cards: [make(1, "rare")], animations: true, onBurst });
    fireEvent.click(card());
    expect(screen.queryByTestId("reveal-shockwave")).toBeNull();
    expect(screen.queryByTestId("reveal-burst")).toBeNull();
    expect(onBurst).not.toHaveBeenCalled();
  });

  describe("booster title", () => {
    const title = () => screen.queryByTestId("booster-title");

    it("shows GOLDEN BOOSTER at the start of a golden reveal, then goes away", () => {
      vi.useFakeTimers();
      wrap({ golden: true, animations: true });
      expect(title()).toHaveTextContent(messages.reveal.goldenBooster);
      act(() => vi.advanceTimersByTime(1500));
      expect(title()).toBeNull();
    });

    it("shows DIVINE BOOSTER for a divine batch", () => {
      wrap({ divine: true, golden: true, animations: true });
      expect(title()).toHaveTextContent(messages.reveal.divineBooster);
    });

    it("is not shown for a plain batch or with animations off", () => {
      wrap({ animations: true });
      expect(title()).toBeNull();
      cleanup();
      wrap({ golden: true });
      expect(title()).toBeNull();
    });

    it("does not block a tap", () => {
      wrap({ golden: true, animations: true });
      fireEvent.click(card());
      expect(card()).toHaveAttribute("data-flipped", "true");
    });
  });

  it("ignores a key another handler already took (the pack skipping its tear)", () => {
    vi.useFakeTimers();
    wrap();
    for (const key of [" ", "Enter"]) {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      e.preventDefault();
      act(() => {
        window.dispatchEvent(e);
      });
    }
    act(() => vi.advanceTimersByTime(1000)); // no fast forward armed
    expect(card()).toHaveAttribute("data-flipped", "false");
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/2");
  });

  it("glows warm behind a golden reveal only", () => {
    wrap({ golden: true });
    expect(screen.getByTestId("golden-ambient")).toBeInTheDocument();
    cleanup();
    wrap({ divine: true });
    expect(screen.queryByTestId("golden-ambient")).toBeNull();
  });
});
