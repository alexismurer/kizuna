import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningHeader } from "@/components/opening/OpeningHeader";
import { DEFAULT_PREFS } from "@/lib/fx/prefs";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("OpeningHeader", () => {
  it("Escape closes the settings popover and is consumed, so the reveal keeps going", () => {
    const later = vi.fn();
    window.addEventListener("keydown", later);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OpeningHeader
          packId="mix"
          name="Mix"
          hue={200}
          freeStock={2}
          currency={0}
          prefs={DEFAULT_PREFS}
          onPrefs={() => {}}
        />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByRole("button", { name: messages.opening.settings });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect((later.mock.calls[0][0] as KeyboardEvent).defaultPrevented).toBe(true);
    window.removeEventListener("keydown", later);
  });
});
