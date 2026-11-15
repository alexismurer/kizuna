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

afterEach(cleanup);

describe("CardView", () => {
  it("renders name, number, series, stats on one line and badge", () => {
    wrap(<CardView card={card} />);
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("#12/5000")).toBeInTheDocument();
    expect(screen.getByText("Great Series")).toBeInTheDocument();
    const bar = screen.getByText(/POW 90/).parentElement!;
    expect(bar).toHaveTextContent("POW 90");
    expect(bar).toHaveTextContent("AURA 60");
    expect(screen.getByLabelText("Epic")).toBeInTheDocument();
  });

  it("shows the native name at md but not at sm", () => {
    wrap(<CardView card={card} size="md" />);
    expect(screen.getByText("ヒーロー")).toBeInTheDocument();
    cleanup();
    wrap(<CardView card={card} size="sm" />);
    expect(screen.queryByText("ヒーロー")).toBeNull();
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
    expect(screen.getByText("ANICARDS")).toBeInTheDocument();
  });
});
