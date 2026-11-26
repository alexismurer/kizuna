import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { AwakenReveal } from "@/components/awakening/AwakenReveal";
import { RevealFlow, type RevealCard } from "@/components/opening/RevealFlow";

let reduced = false;
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced }));

const awakening = { title: "The Strongest", form: "Domain Expansion", effect: "void" as const, accent: "#7c5cff", total: 30 };
const card = {
  number: 12,
  total: 120,
  name: "Gojo Satoru",
  nativeName: null,
  imageUrl: null,
  seriesTitle: "Jujutsu Kaisen",
  rarity: "mythic" as const,
  pow: 90,
  aura: 95,
};

function wrap(props: Partial<React.ComponentProps<typeof AwakenReveal>> = {}) {
  const onDone = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AwakenReveal awakening={awakening} card={card} serial={7} total={30} onDone={onDone} {...props} />
    </NextIntlClientProvider>,
  );
  return onDone;
}

afterEach(() => {
  cleanup();
  reduced = false;
});

describe("AwakenReveal", () => {
  it("stamps the serial out of the total", () => {
    wrap();
    expect(screen.getByText("#7 / 30")).toBeInTheDocument();
  });

  it("calls onDone when skipped", () => {
    const onDone = wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.awakening.reveal.skip }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("calls onDone on Escape", () => {
    const onDone = wrap();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("says who drew it first", () => {
    wrap();
    expect(screen.getByText(messages.awakening.reveal.firstYou)).toBeInTheDocument();
    cleanup();
    wrap({ firstOwner: "sakura" });
    expect(screen.getByText("First drawn by sakura")).toBeInTheDocument();
  });

  it("shows the awakened card at once with reduced motion, with a continue button", () => {
    reduced = true;
    const onDone = wrap();
    expect(screen.getAllByText("Domain Expansion").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: messages.awakening.reveal.skip })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.awakening.reveal.continue }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("RevealFlow with an awakened slot", () => {
  const deck: RevealCard[] = [
    { card: card, rarity: "common", isNew: false, packIndex: 1, awakening: { awakening, serial: 7, total: 30 } },
    { card: { ...card, name: "Other", rarity: "rare" }, rarity: "rare", isNew: false, packIndex: 1 },
  ];
  function flow() {
    const onDone = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <RevealFlow cards={deck} packCount={1} onDone={onDone} animations={false} sound={false} />
      </NextIntlClientProvider>,
    );
    return onDone;
  }

  it("plays the awakening once the base card is flipped, then carries on", () => {
    reduced = true;
    const onDone = flow();
    expect(screen.queryByTestId("awaken-reveal")).toBeNull();
    fireEvent.click(screen.getByTestId("reveal-card"));
    expect(screen.getByTestId("awaken-reveal")).toBeInTheDocument();
    // the deck waits under the overlay
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("1/2");
    fireEvent.click(screen.getByRole("button", { name: messages.awakening.reveal.continue }));
    expect(screen.queryByTestId("awaken-reveal")).toBeNull();
    fireEvent.click(screen.getByTestId("reveal-card"));
    expect(screen.getByTestId("reveal-counter")).toHaveTextContent("2/2");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("still plays it before the summary when Reveal all skips past it", () => {
    reduced = true;
    const onDone = flow();
    fireEvent.click(screen.getByRole("button", { name: messages.reveal.revealAll }));
    expect(screen.getByTestId("awaken-reveal")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: messages.awakening.reveal.continue }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
