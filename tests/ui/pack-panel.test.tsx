import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { PackPanel } from "@/components/PackPanel";
import { StatusChips } from "@/components/StatusChips";
import type { PackType, Status } from "@/lib/game/types";
import messages from "../../messages/en.json";
import { vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const pack = (id: string, kind: PackType["kind"]): PackType => ({
  id, kind, price: null, slotFloors: ["common", "rare"], multipliers: {}, themeId: null,
});
const status = (o: Partial<Status> = {}): Status => ({
  freeStock: 3, nextFreeAt: null, currency: 0, untilGolden: 4, untilPity: 120,
  dailyOpenedToday: false, ...o,
});

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("PackPanel counters", () => {
  it("shows golden and pity lines for standard packs", () => {
    wrap(<PackPanel pack={pack("mix", "free")} status={status()} busy={false} error={null} onOpen={() => {}} />);
    expect(screen.getByText("4 packs until golden")).toBeInTheDocument();
    expect(screen.getByText("120 packs until sure Mythic")).toBeInTheDocument();
  });

  it("hides golden and pity lines for the daily pack", () => {
    wrap(<PackPanel pack={pack("daily", "daily")} status={status()} busy={false} error={null} onOpen={() => {}} />);
    expect(screen.queryByText(/until golden/)).toBeNull();
    expect(screen.queryByText(/sure Mythic/)).toBeNull();
  });

  it("treats a pity of 0 or less as the next pack with a Mythic pool", () => {
    wrap(<PackPanel pack={pack("mix", "free")} status={status({ untilPity: -2 })} busy={false} error={null} onOpen={() => {}} />);
    expect(screen.getByText(messages.pack.pityNext)).toBeInTheDocument();
    expect(screen.queryByText(/-2/)).toBeNull();
  });
});

describe("StatusChips pity", () => {
  it("never shows a negative pity count", () => {
    wrap(<StatusChips status={status({ untilPity: -1 })} />);
    expect(screen.queryByText("-1")).toBeNull();
    expect(screen.getByText(messages.chips.pityNext)).toBeInTheDocument();
  });
});
