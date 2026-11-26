import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MoreMenu } from "@/components/MoreMenu";

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MoreMenu />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("button", { name: "More" });
}

afterEach(cleanup);

describe("MoreMenu", () => {
  it("opens on click with Friends, Leaderboard, Rebirth and Wiki", () => {
    const button = setup();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Wiki/ })).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const rows = within(screen.getByTestId("more-menu")).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.textContent)).toEqual([
      "友FriendsYour friends and messages",
      "順LeaderboardThe best collectors",
      "転RebirthSend your album back into play",
      "典WikiEvery character page",
    ]);
    expect(screen.getByRole("link", { name: /Wiki/ })).toHaveAttribute("href", "/wiki");
    expect(screen.getByRole("link", { name: /Friends/ })).toHaveAttribute("href", "/friends");
    expect(screen.getByRole("link", { name: /Leaderboard/ })).toHaveAttribute("href", "/leaderboard");
    expect(screen.getByRole("link", { name: /Rebirth/ })).toHaveAttribute("href", "/rebirth");
  });

  it("closes on Escape and on a click outside", () => {
    const button = setup();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("more-menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
