import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const actions = vi.hoisted(() => ({
  adminSeriesSearch: vi.fn(),
  adminSavePool: vi.fn(),
  adminDeletePool: vi.fn(),
  adminSaveSeasonal: vi.fn(),
  adminEndSeasonal: vi.fn(),
}));
vi.mock("@/lib/actions/admin", () => actions);

import { PoolsPanel } from "@/components/admin/PoolsPanel";
import { SeasonalPanel } from "@/components/admin/SeasonalPanel";
import { SeriesPicker } from "@/components/admin/SeriesPicker";

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => Object.values(actions).forEach((f) => f.mockReset()));
afterEach(cleanup);

const found = [
  { id: 7, title: "Naruto", cards: 40 },
  { id: 9, title: "Bleach", cards: 30 },
];

async function pick(title: string, query = "na") {
  fireEvent.change(screen.getByLabelText("Search series"), { target: { value: query } });
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Add ${title}`) }));
}

describe("SeriesPicker", () => {
  it("adds a searched series as a chip and removes it", async () => {
    actions.adminSeriesSearch.mockResolvedValue({ ok: true, data: found });
    const onChange = vi.fn();
    wrap(<SeriesPicker value={[]} onChange={onChange} />);
    await pick("Naruto");
    expect(actions.adminSeriesSearch).toHaveBeenCalledWith("na");
    expect(onChange).toHaveBeenCalledWith([{ id: 7, title: "Naruto" }]);
    cleanup();
    const onChange2 = vi.fn();
    wrap(<SeriesPicker value={[{ id: 7, title: "Naruto" }]} onChange={onChange2} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Naruto" }));
    expect(onChange2).toHaveBeenCalledWith([]);
  });
});

describe("PoolsPanel", () => {
  it("saves a new pool with name and series", async () => {
    actions.adminSeriesSearch.mockResolvedValue({ ok: true, data: found });
    actions.adminSavePool.mockResolvedValue({ ok: true, data: 3 });
    wrap(<PoolsPanel initial={[]} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Classics" } });
    await pick("Naruto");
    fireEvent.click(screen.getByRole("button", { name: "Save pool" }));
    await waitFor(() => expect(actions.adminSavePool).toHaveBeenCalledWith(null, "Classics", [7]));
    expect(await screen.findByText("Classics")).toBeInTheDocument();
  });

  it("shows the invalid_pool error text", async () => {
    actions.adminSavePool.mockResolvedValue({ ok: false, error: "invalid_pool" });
    wrap(<PoolsPanel initial={[{ id: 1, name: "Old", series: [{ id: 7, title: "Naruto" }] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save pool" }));
    expect(await screen.findByText("A pool needs a name (up to 40 characters) and at least one series.")).toBeInTheDocument();
  });
});

describe("SeasonalPanel", () => {
  const h = 3600_000;
  const iso = (d: number) => new Date(Date.now() + d).toISOString();
  const row = (id: string, title: string, s: number, e: number) => ({
    id,
    title,
    seriesIds: [7],
    startsAt: iso(s),
    endsAt: iso(e),
  });

  it("shows Live / Scheduled / Ended and ends a live one now", async () => {
    actions.adminEndSeasonal.mockResolvedValue({ ok: true, data: null });
    wrap(
      <SeasonalPanel
        initial={[row("season_a", "Alpha", -h, h), row("season_b", "Beta", h, 2 * h), row("season_c", "Gamma", -2 * h, -h)]}
        seriesTitles={{ 7: "Naruto" }}
      />,
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End now" }));
    expect(actions.adminEndSeasonal).toHaveBeenCalledWith("season_a");
    await waitFor(() => expect(screen.getAllByText("Ended")).toHaveLength(2));
  });

  const fill = (title: string, start: string, end: string) => {
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "winter" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: start } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: end } });
  };
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Save seasonal" }));

  it.each([
    ["", "2026-12-01T10:00", "2026-12-02T10:00", true, "Enter a title."],
    ["Winter", "2026-12-01T10:00", "2026-12-02T10:00", false, "Pick at least one series."],
    ["Winter", "2026-12-02T10:00", "2026-12-01T10:00", true, "The end must be after the start."],
  ])("validates locally (%s)", async (title, s, e, withSeries, text) => {
    actions.adminSeriesSearch.mockResolvedValue({ ok: true, data: found });
    wrap(<SeasonalPanel initial={[]} seriesTitles={{}} />);
    fill(title, s, e);
    if (withSeries) await pick("Naruto");
    save();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(actions.adminSaveSeasonal).not.toHaveBeenCalled();
  });

  it("saves with ISO dates", async () => {
    actions.adminSeriesSearch.mockResolvedValue({ ok: true, data: found });
    actions.adminSaveSeasonal.mockResolvedValue({ ok: true, data: "season_winter" });
    wrap(<SeasonalPanel initial={[]} seriesTitles={{}} />);
    fill("Winter", "2026-12-01T10:00", "2026-12-02T10:00");
    await pick("Naruto");
    save();
    await waitFor(() =>
      expect(actions.adminSaveSeasonal).toHaveBeenCalledWith(
        "winter",
        "Winter",
        [7],
        new Date("2026-12-01T10:00").toISOString(),
        new Date("2026-12-02T10:00").toISOString(),
      ),
    );
  });
});
