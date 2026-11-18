import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { SeriesScene } from "@/components/opening/SeriesScene";

function setup(onDone = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SeriesScene
        rarity="legendary"
        seriesTitle="Fire Force"
        coverUrl="https://img.test/cover.jpg"
        imageUrl={null}
        number={448}
        total={6736}
        onDone={onDone}
      />
    </NextIntlClientProvider>,
  );
  return onDone;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SeriesScene", () => {
  it("shows the rarity word, then the series, then its popularity, then ends", () => {
    const onDone = setup();
    expect(screen.getByTestId("scene-rarity")).toHaveTextContent("Legendary");
    expect(screen.queryByText("Fire Force")).toBeNull();
    act(() => void vi.advanceTimersByTime(900));
    expect(screen.getByText("Fire Force")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fire Force" })).toHaveAttribute("src", "https://img.test/cover.jpg");
    act(() => void vi.advanceTimersByTime(900));
    expect(screen.getByText("Top 6.7%")).toBeInTheDocument();
    expect(screen.getByText("#448")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips on the button or Space", () => {
    const onDone = setup();
    fireEvent.click(screen.getByRole("button", { name: "Skip ›" }));
    fireEvent.keyDown(window, { key: " " });
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
