import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePicker } from "@/components/social/AppearancePicker";
import { equipCosmetic } from "@/lib/actions/games";
import messages from "../../messages/en.json";

vi.mock("@/lib/actions/games", () => ({ equipCosmetic: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

describe("AppearancePicker", () => {
  it("says so when equipping fails", async () => {
    vi.mocked(equipCosmetic).mockResolvedValue({ ok: false, error: "not_owned" });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppearancePicker owned={["title_ace21"]} me={{ username: "ann", avatarUrl: null, frameId: null, titleId: null, bannerId: null, nameId: null }} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ace of 21" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
