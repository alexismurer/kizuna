import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "@/components/social/Avatar";
import { BannerBackdrop } from "@/components/social/BannerBackdrop";
import { PlayerName } from "@/components/social/PlayerName";

afterEach(cleanup);

describe("name styles", () => {
  it("styles the name the player equipped", () => {
    render(<PlayerName name="ann" styleId="name_prism" />);
    const el = screen.getByText("ann");
    expect(el).toHaveAttribute("data-name-style", "prism");
    expect(el).toHaveClass("name-prism");
  });
  it("leaves the name plain without a style or for an unknown id", () => {
    const { container } = render(
      <>
        <PlayerName name="ann" />
        <PlayerName name="bob" styleId="name_nope" />
      </>,
    );
    expect(container.querySelector("[data-name-style]")).toBeNull();
  });
});

describe("banners and new frames", () => {
  it("draws the equipped banner", () => {
    const { container } = render(<BannerBackdrop id="banner_stars" />);
    expect(container.querySelector('[data-banner="stars"]')).toHaveClass("banner-stars");
  });
  it("draws nothing for no banner", () => {
    const { container } = render(<BannerBackdrop id={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("draws the CSS frames", () => {
    const { container } = render(<Avatar url={null} username="ann" size={40} frame="frame_ember" />);
    expect(container.querySelector('[data-frame="ember"] .frame-ember')).not.toBeNull();
  });
});
