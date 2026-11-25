import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayNavLink } from "@/components/PlayNavLink";
import messages from "../../messages/en.json";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => path.current,
}));

function wrap() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlayNavLink />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  path.current = "/";
});
afterEach(cleanup);

describe("PlayNavLink", () => {
  it("shows a New tag", () => {
    wrap();
    expect(screen.getByTestId("play-new")).toHaveTextContent("PlayNew");
  });

  it("keeps the tag after the game room was visited (shown all the time for now)", () => {
    path.current = "/play/duel";
    wrap();
    expect(screen.getByTestId("play-new")).toHaveAttribute("href", "/play");
    cleanup();
    path.current = "/";
    wrap();
    expect(screen.getByTestId("play-new")).toHaveTextContent("PlayNew");
  });
});
