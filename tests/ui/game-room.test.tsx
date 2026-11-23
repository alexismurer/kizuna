import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

import { GameRoom } from "@/components/games/GameRoom";

afterEach(cleanup);

describe("GameRoom", () => {
  it("leads to Duel and announces tickets and the boss", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GameRoom art={["/a.png", "/b.png", "/c.png"]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Game room" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Duel/ })).toHaveAttribute("href", "/play/duel");
    expect(screen.getByText("Arcade tickets")).toBeInTheDocument();
    expect(screen.getByText("BOSS OF THE WEEK")).toBeInTheDocument();
  });
});
