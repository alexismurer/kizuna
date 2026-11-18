import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function setup(estimate = 306) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecycleButton
        mode="all"
        estimate={estimate}
        breakdown={[
          { rarity: "common", copies: 6 },
          { rarity: "mythic", copies: 2 },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => rpc.mockReset());

// the modal itself: tests/ui/recycle-modal.test.tsx
describe("RecycleButton (all)", () => {
  it("opens the recycle modal without recycling", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /recycle duplicates/i }));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Recycle duplicates" })).toBeInTheDocument();
  });

  it("is disabled with nothing to recycle", () => {
    setup(0);
    expect(screen.getByRole("button", { name: /recycle duplicates/i })).toBeDisabled();
  });
});
