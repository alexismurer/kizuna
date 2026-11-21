import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSelect } from "@/components/LanguageSelect";
import messages from "../../messages/en.json";

const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/collection",
}));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  document.cookie = "NEXT_LOCALE=; max-age=0; path=/";
});

const renderSelect = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguageSelect />
    </NextIntlClientProvider>,
  );

describe("LanguageSelect", () => {
  it("lists the nine languages alphabetically in their own words", () => {
    renderSelect();
    const button = screen.getByRole("button", { name: "Language: English" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Deutsch",
      "English",
      "Español",
      "Français",
      "Polski",
      "Português",
      "Русский",
      "中文",
      "日本語",
    ]);
    expect(screen.getByRole("option", { name: "English" })).toHaveAttribute("aria-selected", "true");
  });

  it("stores the picked language and re-renders the same page", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    fireEvent.click(screen.getByRole("option", { name: "Polski" }));
    expect(document.cookie).toContain("NEXT_LOCALE=pl");
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape without picking", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
