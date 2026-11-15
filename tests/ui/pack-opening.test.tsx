import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackOpening } from "@/components/PackOpening";
import type { RevealCard } from "@/components/PackOpening";
import messages from "../../messages/en.json";

const cards: RevealCard[] = Array.from({ length: 5 }, (_, i) => ({
  slot: i + 1,
  isNew: i === 0,
  card: {
    id: i + 1,
    number: i + 1,
    name: `Hero ${i + 1}`,
    nativeName: null,
    imageUrl: null,
    seriesId: 1,
    seriesTitle: "Series",
    rarity: i === 4 ? "epic" : "common",
    pow: 10,
    aura: 10,
  },
}));

function setup(onDone = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PackOpening cards={cards} total={120} onDone={onDone} onAgain={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

const revealed = () => document.querySelectorAll("[data-revealed='true']").length;

afterEach(cleanup);

describe("PackOpening", () => {
  it("starts face down and flips one card per click", () => {
    setup();
    expect(revealed()).toBe(0);
    const stage = screen.getByTestId("reveal-stage");
    fireEvent.click(stage);
    fireEvent.click(stage);
    expect(revealed()).toBe(2);
  });

  it("Escape reveals everything and shows Done", () => {
    setup();
    expect(screen.queryByText("Done")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(revealed()).toBe(5);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Open another")).toBeInTheDocument();
  });

  it("Space flips while unfinished but does not hijack buttons when finished", () => {
    setup();
    const space = () => fireEvent.keyDown(window, { key: " " });
    expect(space()).toBe(false);
    expect(revealed()).toBe(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(space()).toBe(true);
    expect(screen.getByText("Done")).toHaveFocus();
  });

  it("Escape after finished calls onDone; Enter flips from the stage", () => {
    const onDone = vi.fn();
    setup(onDone);
    fireEvent.keyDown(screen.getByTestId("reveal-stage"), { key: "Enter" });
    expect(revealed()).toBe(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
