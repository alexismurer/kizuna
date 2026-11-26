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
const upload = vi.hoisted(() => ({ uploadAwakeningMedia: vi.fn() }));
vi.mock("@/lib/awakening/upload", () => upload);
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

  it("blocks an upload while the id is invalid and never uploads", async () => {
    wrap(<AwakeningsPanel initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "New awakening" }));
    const input = screen.getByLabelText("Loop file", { selector: "input" });
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(4)], "a.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByText(/The ID needs 3 to 48 characters/)).toBeInTheDocument();
    expect(upload.uploadAwakeningMedia).not.toHaveBeenCalled();
  });

  it("clears the save error on Cancel", async () => {
    actions.adminSaveAwakening.mockResolvedValue({ ok: false, error: "invalid_awakening" });
    wrap(<AwakeningsPanel initial={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save awakening" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("needs a second click to delete", async () => {
    actions.adminDeleteAwakening.mockResolvedValue({ ok: true, data: null });
    wrap(<AwakeningsPanel initial={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Fresh Goku" }));
    expect(actions.adminDeleteAwakening).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(actions.adminDeleteAwakening).toHaveBeenCalledWith("goku-new"));
  });
});
