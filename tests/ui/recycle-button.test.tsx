import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ rpc }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { RecycleButton } from "@/components/RecycleButton";

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecycleButton
        mode="all"
        estimate={306}
        breakdown={[
          { rarity: "common", copies: 6 },
          { rarity: "mythic", copies: 2 },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 306, error: null });
});

describe("RecycleButton (all)", () => {
  it("first click shows a per-rarity summary without recycling", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /recycle duplicates/i }));
    expect(rpc).not.toHaveBeenCalled();
    const summary = screen.getByRole("group", { name: /recycle these duplicates/i });
    expect(summary).toHaveTextContent("Common × 6 · +6");
    expect(summary).toHaveTextContent("Mythic × 2 · +300");
    expect(summary).toHaveTextContent("Total +306");
  });

  it("Confirm recycles once", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /recycle duplicates/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("+306"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("recycle_all_duplicates");
  });

  it("Cancel closes the summary without recycling", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /recycle duplicates/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("button", { name: /recycle duplicates/i })).toBeInTheDocument();
  });
});
