import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotStrip, type Slot } from "@/components/opening/SlotStrip";
import messages from "../../messages/en.json";

const slot = (n: number): Slot => ({
  rarity: "epic",
  imageUrl: null,
  card: {
    number: 1000 + n,
    total: 5000,
    name: `Hero ${n}`,
    imageUrl: null,
    seriesTitle: "One Piece",
    rarity: "epic",
    pow: 10,
    aura: 20,
  },
});

function wrap(filled = 1) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SlotStrip slots={[slot(1), slot(2)]} filled={filled} current={0} label="Cards" />
    </NextIntlClientProvider>,
  );
}

const slots = () => screen.getAllByTestId("slot");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SlotStrip preview", () => {
  it("hovering a revealed slot with a mouse shows the card itself, like everywhere else in the app", () => {
    wrap();
    fireEvent.pointerEnter(slots()[0], { pointerType: "mouse" });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Hero 1");
    expect(tip).toHaveTextContent("One Piece");
    expect(tip).toHaveTextContent("#1001");
    // the app's card face (5:7), not a picture with a caption under it
    expect(tip.querySelector(".cv")?.className).toContain("aspect-[5/7]");
    fireEvent.pointerLeave(slots()[0], { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows nothing for a slot that is not revealed yet", () => {
    wrap(1);
    fireEvent.pointerEnter(slots()[1], { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a touch held for 400 ms shows it and lifting the finger hides it", () => {
    vi.useFakeTimers();
    wrap();
    fireEvent.pointerDown(slots()[0], { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Hero 1");
    fireEvent.pointerUp(slots()[0], { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a short tap shows nothing", () => {
    vi.useFakeTimers();
    wrap();
    fireEvent.pointerDown(slots()[0], { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerUp(slots()[0], { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
