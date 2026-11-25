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
  it("shows a New tag until the game room has been visited", () => {
    wrap();
    expect(screen.getByTestId("play-new")).toHaveTextContent("PlayNew");
  });

  it("drops the tag on /play and remembers it", () => {
    path.current = "/play/duel";
    wrap();
    expect(screen.queryByTestId("play-new")).toBeNull();
    expect(localStorage.getItem("kizuna:play-seen")).toBe("1");
    cleanup();
    path.current = "/";
    wrap();
    expect(screen.queryByTestId("play-new")).toBeNull();
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute("href", "/play");
  });
});
