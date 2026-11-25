import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => createTranslator({ locale: "en", messages }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const status = vi.hoisted(() => ({ value: null as object | null }));
vi.mock("@/lib/supabase/boosters", () => ({ loadStatus: async () => status.value }));

import { Footer } from "@/components/Footer";

afterEach(cleanup);
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;

describe("Footer", () => {
  it("puts the logo and the disclaimer on one line, without the AniList credit", async () => {
    render(<NextIntlClientProvider locale="en" timeZone="Europe/Paris" messages={messages}>{await Footer()}</NextIntlClientProvider>);
    const disclaimer = screen.getByText(messages.footer.disclaimer);
    const logo = screen.getByRole("link", { name: "Kizuna" });
    expect(disclaimer.parentElement).toBe(logo.parentElement);
    expect(disclaimer.parentElement).toHaveClass("flex-row");
    expect(screen.queryByText(/AniList/)).not.toBeInTheDocument();
  });

  it("hides on phones for players, who get it in the More sheet", async () => {
    status.value = { missionsClaimable: 0 };
    const { container } = render(
      <NextIntlClientProvider locale="en" timeZone="Europe/Paris" messages={messages}>{await Footer()}</NextIntlClientProvider>,
    );
    expect(container.querySelector("footer")).toHaveClass("hidden", "md:block");
    status.value = null;
  });
});
