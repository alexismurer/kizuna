import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "@/components/social/Avatar";
import { PlayerTitle } from "@/components/social/PlayerTitle";
import messages from "../../messages/en.json";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("Avatar frames", () => {
  it("draws the frame the player equipped", () => {
    const { container } = wrap(<Avatar url="https://x/a.png" username="ann" size={40} frame="frame_gold" />);
    expect(container.querySelector('[data-frame="gold"]')).not.toBeNull();
  });
  it("draws the neon frame around initials too", () => {
    const { container } = wrap(<Avatar url={null} username="ann" size={40} frame="frame_neon" />);
    expect(container.querySelector('[data-frame="neon"]')).not.toBeNull();
  });
  it("draws no frame by default or for an unknown id", () => {
    const { container } = wrap(
      <>
        <Avatar url="https://x/a.png" username="ann" size={40} />
        <Avatar url="https://x/a.png" username="ann" size={40} frame="title_ace21" />
      </>,
    );
    expect(container.querySelector("[data-frame]")).toBeNull();
  });
});

describe("PlayerTitle", () => {
  it("shows the equipped title's name", () => {
    wrap(<PlayerTitle id="title_ace21" />);
    expect(screen.getByText("Ace of 21")).toBeInTheDocument();
  });
  it("shows nothing without a title", () => {
    const { container } = wrap(<PlayerTitle id={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
