import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RecycleButton } from "@/components/RecycleButton";

const breakdown = [
  { rarity: "epic" as const, copies: 9 },
  { rarity: "rare" as const, copies: 51 },
  { rarity: "uncommon" as const, copies: 50 },
  { rarity: "common" as const, copies: 63 },
];

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecycleButton mode="all" estimate={356} breakdown={breakdown} compact={{ duplicates: 173 }} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Recycle duplicates/ }));
  return screen.getByRole("dialog", { name: "Recycle duplicates" });
}

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 356, error: null });
});

describe("RecycleModal", () => {
  it("shows a chip per rarity with copies and gain", () => {
    const dialog = setup();
    const epic = within(dialog).getByRole("switch", { name: /Epic/ });
    expect(epic).toHaveTextContent("×9 · +90");
    expect(epic).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("switch", { name: /Legendary/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Recycle 173 duplicates · +356" })).toBeEnabled();
  });

  it("keeps a rarity when its chip is turned off", () => {
    const dialog = setup();
    const epic = within(dialog).getByRole("switch", { name: /Epic/ });
    fireEvent.click(epic);
    expect(epic).toHaveAttribute("aria-checked", "false");
    expect(epic).toHaveTextContent("Kept");
    expect(within(dialog).getByRole("button", { name: "Recycle 164 duplicates · +266" })).toBeInTheDocument();
  });

  it("disables the button with nothing selected and never calls the server", () => {
    const dialog = setup();
    for (const r of ["Epic", "Rare", "Uncommon", "Common"]) {
      fireEvent.click(within(dialog).getByRole("switch", { name: new RegExp(r) }));
    }
    const go = within(dialog).getByRole("button", { name: /Recycle 0 duplicates/ });
    expect(go).toBeDisabled();
    fireEvent.click(go);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recycles the selected rarities and shows the result", async () => {
    const dialog = setup();
    fireEvent.click(within(dialog).getByRole("button", { name: "Recycle 173 duplicates · +356" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("recycle_duplicates", {
        p_rarities: ["epic", "rare", "uncommon", "common"],
      }),
    );
    expect(await within(dialog).findByText("+356 recovered")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("RecycleModal on desktop", () => {
  it("shows its title as a heading", () => {
    const mm = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("matchMedia", mm);
    try {
      const dialog = setup();
      expect(within(dialog).getByRole("heading", { name: "Recycle duplicates" })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
