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

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PackOpening cards={cards} total={120} onDone={vi.fn()} onAgain={vi.fn()} />
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
});
