import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { CardBack } from "@/components/card/CardBack";
import { CardView } from "@/components/card/CardView";
import messages from "../../messages/en.json";

const card = {
  number: 12,
  total: 5000,
  name: "Hero",
  nativeName: "ヒーロー",
  imageUrl: "https://example.com/a.jpg",
  seriesTitle: "Great Series",
  rarity: "epic" as const,
  pow: 90,
  aura: 60,
};

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("CardView", () => {
  it("stills the sheen when the Animations setting is off", () => {
    const sheen = () => document.querySelector(".card-sheen")!.parentElement!;
    const { unmount } = wrap(<CardView card={card} />);
    expect(sheen()).not.toHaveClass("fx-still");
    unmount();
    localStorage.setItem("kizuna.prefs", JSON.stringify({ animations: false }));
    wrap(<CardView card={card} />);
    expect(sheen()).toHaveClass("fx-still");
  });

  it("renders name and badge over the top, series and number over the bottom, no stats", () => {
    const { container } = wrap(<CardView card={card} />);
    expect(container.querySelector(".cv-top")).toHaveTextContent("Hero");
    expect(screen.getByLabelText("Epic").closest(".cv-top")).not.toBeNull();
    expect(container.querySelector(".cv-bottom")).toHaveTextContent("Great Series#12/5000");
    expect(container.firstElementChild).toHaveClass("aspect-[5/7]");
    expect(screen.queryByText(/POW/)).toBeNull();
    expect(screen.queryByText("ヒーロー")).toBeNull();
  });

  it("fills its container when fluid", () => {
    const { container } = wrap(<CardView card={card} fluid />);
    expect(container.firstElementChild).toHaveClass("w-full");
  });

  it("omits the total when it is unknown", () => {
    wrap(<CardView card={{ ...card, total: 0 }} />);
    expect(screen.getByText("#12")).toBeInTheDocument();
  });

  it("shows New only when isNew", () => {
    wrap(<CardView card={card} isNew />);
    expect(screen.getByText("NEW")).toBeInTheDocument();
    cleanup();
    wrap(<CardView card={card} />);
    expect(screen.queryByText("NEW")).toBeNull();
  });

  it("swaps a broken image for the placeholder", () => {
    wrap(<CardView card={card} />);
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("No art")).toBeInTheDocument();
  });
});

describe("CardBack", () => {
  it("has the rarity glow class", () => {
    const { container } = wrap(<CardBack size="md" glowRarity="legendary" />);
    expect(container.querySelector(".back-glow-legendary")).not.toBeNull();
    expect(screen.getByText("KIZUNA")).toBeInTheDocument();
  });
});
