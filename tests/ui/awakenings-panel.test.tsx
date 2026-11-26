import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const actions = vi.hoisted(() => ({
  adminSaveAwakening: vi.fn(),
  adminDeleteAwakening: vi.fn(),
  adminCardSearch: vi.fn(),
  adminPlayerSearch: vi.fn(),
}));
vi.mock("@/lib/actions/admin", () => actions);
vi.mock("@/lib/awakening/upload", () => ({ uploadAwakeningMedia: vi.fn() }));
vi.mock("@/components/awakening/AwakenReveal", () => ({ AwakenReveal: () => null }));

import { AwakeningsPanel } from "@/components/admin/AwakeningsPanel";

const base = {
  baseCardId: 1,
  baseName: "Goku",
  baseImage: null,
  form: "Ultra",
  effect: "sun" as const,
  accent: "#ff0000",
  sort: 0,
  active: true,
  loopUrl: null,
  posterUrl: null,
  revealUrl: null,
};
const rows = [
  { ...base, id: "goku-ultra", title: "Ultra Goku", total: 50, issued: 3 },
  { ...base, id: "goku-new", title: "Fresh Goku", total: 20, issued: 0 },
];

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => Object.values(actions).forEach((f) => f.mockReset()));
afterEach(cleanup);

describe("AwakeningsPanel", () => {
  it("renders a row per awakening with issued / total", () => {
    wrap(<AwakeningsPanel initial={rows} />);
    expect(screen.getAllByText("Ultra Goku").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fresh Goku").length).toBeGreaterThan(0);
    expect(screen.getByText("3 / 50 issued")).toBeInTheDocument();
  });

  it("disables delete when copies were issued", () => {
    wrap(<AwakeningsPanel initial={rows} />);
    expect(screen.getByRole("button", { name: "Delete Ultra Goku" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Fresh Goku" })).toBeEnabled();
  });

  it("shows the mapped error when saving is rejected", async () => {
    actions.adminSaveAwakening.mockResolvedValue({ ok: false, error: "invalid_awakening" });
    wrap(<AwakeningsPanel initial={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    fireEvent.change(screen.getByLabelText("Accent colour"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Save awakening" }));
    expect(await screen.findByText(/Check the fields: ID, title and form/)).toBeInTheDocument();
    await waitFor(() => expect(actions.adminSaveAwakening).toHaveBeenCalled());
  });
});
