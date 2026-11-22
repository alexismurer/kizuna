import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomPicker } from "@/components/home/CustomPicker";
import messages from "../../messages/en.json";

const saveCustomSeries = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/customBooster", () => ({ saveCustomSeries }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

// 60 series, most popular first (the server's order); #55 is "Naruto"
const OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  title: i === 54 ? "Naruto" : `Series ${i + 1}`,
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
const search = () => screen.getByRole("combobox", { name: messages.home.custom.search });
const type = (v: string) => fireEvent.change(search(), { target: { value: v } });

afterEach(() => {
  cleanup();
  saveCustomSeries.mockReset();
  refresh.mockReset();
});

describe("CustomPicker", () => {
  it("suggests only the 50 most popular series", () => {
    wrap();
    expect(screen.getAllByRole("checkbox")).toHaveLength(50);
    expect(box("Series 50")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Series 51\b/ })).toBeNull();
  });

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

  it("typing shows matching series from the whole catalog; choosing one picks it and clears the search", () => {
    wrap();
    expect(screen.queryByRole("listbox")).toBeNull();
    type("naru");
    const list = screen.getByRole("listbox");
    fireEvent.click(within(list).getByRole("option", { name: /Naruto/ }));
    expect(search()).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("1/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Naruto" })).toBeInTheDocument();
  });

  it("Enter picks the first match", () => {
    wrap();
    type("naruto");
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Remove Naruto" })).toBeInTheDocument();
  });

  it("says so when nothing matches, and shows at most 8 matches", () => {
    wrap();
    type("zzz");
    expect(screen.getByText(messages.home.custom.noMatch)).toBeInTheDocument();
    type("series");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(8);
  });

  it("a pick from outside the suggestions shows as a chip that can be removed", () => {
    wrap([55]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Naruto" }));
    expect(screen.queryByRole("button", { name: "Remove Naruto" })).toBeNull();
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  it("costs 150 when editing and stays disabled while the picks are unchanged", () => {
    wrap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const save = screen.getByRole("button", { name: "Save · 150" });
    expect(save).toBeDisabled();
    fireEvent.click(box("Series 10"));
    fireEvent.click(box("Series 11"));
    expect(save).toBeEnabled();
  });

  it("keeps each hidden checkbox inside its own row, so focusing it never scrolls the whole dialog", () => {
    wrap();
    for (const b of screen.getAllByRole("checkbox")) expect(b.closest("label")).toHaveClass("relative");
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
