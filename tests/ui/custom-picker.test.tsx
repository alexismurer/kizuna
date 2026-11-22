import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomPicker } from "@/components/home/CustomPicker";
import messages from "../../messages/en.json";

const saveCustomSeries = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/customBooster", () => ({ saveCustomSeries }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

const OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  title: i === 11 ? "Naruto" : `Series ${i + 1}`,
  cover: null,
  cards: 10 + i,
}));

function wrap(initial: number[] = [], onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CustomPicker options={OPTIONS} initial={initial} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const box = (title: string) => screen.getByRole("checkbox", { name: new RegExp(`^${title}\\b`) });
const pick = (n: number) => {
  for (let i = 1; i <= n; i++) fireEvent.click(box(`Series ${i}`));
};

afterEach(() => {
  cleanup();
  saveCustomSeries.mockReset();
  refresh.mockReset();
});

describe("CustomPicker", () => {
  it("starts at 0/10 and keeps Save disabled at 9 picks", () => {
    wrap();
    expect(screen.getByText("0/10")).toBeInTheDocument();
    pick(9);
    expect(screen.getByText("9/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save · 250" })).toBeDisabled();
  });

  it("enables Save at 10 and refuses an 11th pick", () => {
    wrap();
    pick(10);
    expect(screen.getByText("10/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save · 250" })).toBeEnabled();
    fireEvent.click(box("Series 11"));
    expect(box("Series 11")).not.toBeChecked();
    expect(screen.getByText("10/10")).toBeInTheDocument();
  });

  it("costs 150 when editing and stays disabled while the picks are unchanged", () => {
    wrap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const save = screen.getByRole("button", { name: "Save · 150" });
    expect(save).toBeDisabled();
    fireEvent.click(box("Series 10"));
    fireEvent.click(box("Series 11"));
    expect(save).toBeEnabled();
  });

  it("filters the list by title, ignoring case", () => {
    wrap();
    fireEvent.change(screen.getByRole("searchbox", { name: messages.home.custom.search }), {
      target: { value: "naru" },
    });
    expect(box("Naruto")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Series 1\b/ })).toBeNull();
  });

  it("saves the 10 ids, then closes and refreshes", async () => {
    saveCustomSeries.mockResolvedValue({ error: null });
    const onClose = wrap();
    pick(10);
    fireEvent.click(screen.getByRole("button", { name: "Save · 250" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveCustomSeries).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the error from a failed save", async () => {
    saveCustomSeries.mockResolvedValue({ error: "errors.insufficient_currency" });
    wrap();
    pick(10);
    fireEvent.click(screen.getByRole("button", { name: "Save · 250" }));
    expect(await screen.findByText(messages.errors.insufficient_currency)).toBeInTheDocument();
  });
});
