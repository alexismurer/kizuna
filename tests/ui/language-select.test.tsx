import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSelect } from "@/components/LanguageSelect";
import messages from "../../messages/en.json";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/collection",
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
});

describe("LanguageSelect", () => {
  it("lists the six languages in their own words and switches on the same page", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageSelect />
      </NextIntlClientProvider>,
    );
    const select = screen.getByRole("combobox", { name: "Language" });
    expect(select).toHaveValue("en");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "English",
      "Español",
      "Français",
      "Português",
      "Русский",
      "日本語",
    ]);
    fireEvent.change(select, { target: { value: "ja" } });
    expect(replace).toHaveBeenCalledWith("/collection", { locale: "ja" });
  });
});
