import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { ShowcaseFan } from "@/components/auth/ShowcaseFan";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ auth: {} }) }));

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

afterEach(cleanup);

describe("LoginPanel", () => {
  it("offers Discord sign-in and explains the invite step", () => {
    wrap(<LoginPanel devLogin={false} />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByText(/invite-only/)).toBeInTheDocument();
    expect(screen.getByText(/AniList/)).toBeInTheDocument();
  });

  it("shows the developer login only when it is enabled", () => {
    wrap(<LoginPanel devLogin={false} />);
    expect(screen.queryByText("Developer login")).toBeNull();
    cleanup();
    wrap(<LoginPanel devLogin />);
    expect(screen.getByText("Developer login")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });
});

describe("ShowcaseFan", () => {
  const card = (number: number, name: string) => ({
    number, total: 5000, name, imageUrl: "https://img/x.png", seriesTitle: "Series",
    rarity: "mythic" as const, pow: 99, aura: 86,
  });

  it("fans out the showcase cards", () => {
    wrap(<ShowcaseFan cards={[card(1, "Satoru Gojou"), card(2, "Levi"), card(3, "Monkey D. Luffy")]} />);
    expect(screen.getByText("Satoru Gojou")).toBeInTheDocument();
    expect(screen.getByText("Levi")).toBeInTheDocument();
    expect(screen.getByText("Monkey D. Luffy")).toBeInTheDocument();
  });

  it("renders nothing without cards", () => {
    const { container } = wrap(<ShowcaseFan cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
