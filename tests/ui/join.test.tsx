import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinLanding, type JoinPreview } from "@/components/referrals/JoinLanding";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
const session = { user: null as { id: string } | null, player: null as { id: string } | null };
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    rpc,
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session.player }) }) }) }),
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import JoinPage from "@/app/[locale]/(main)/join/[code]/page";

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const card = (n: number) => ({ name: `Card ${n}`, imageUrl: `https://x/${n}.jpg`, rarity: "rare" as const });
const preview = (over: Partial<JoinPreview> = {}): JoinPreview => ({
  username: "Alex",
  avatarUrl: null,
  cards: [card(1), card(2), card(3)],
  ...over,
});

async function runContent(code: string) {
  const page = JoinPage({ params: Promise.resolve({ locale: "en", code }) } as never) as ReactElement<{
    children: ReactElement;
  }>;
  // page → AuthShell → Suspense → content
  const content = (page.props.children as ReactElement<{ children: ReactElement }>).props.children;
  expect(isValidElement(content)).toBe(true);
  const Content = content.type as (p: unknown) => Promise<unknown>;
  return Content(content.props);
}

beforeEach(() => {
  rpc.mockReset();
  redirect.mockClear();
  session.user = null;
  session.player = null;
});
afterEach(cleanup);

describe("JoinLanding", () => {
  it("invites with the inviter name, up to 3 cards and a join link", () => {
    wrap(<JoinLanding code="ABCD2345" preview={preview({ cards: [card(1), card(2), card(3), card(4)] })} />);
    expect(screen.getByText("Alex invited you to Kizuna")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Join and get 30 free boosters" })).toHaveAttribute("href", "/login");
  });

  it("sends a signed-in non-player to /invite", () => {
    wrap(<JoinLanding code="ABCD2345" preview={preview()} signedIn />);
    expect(screen.getByRole("link", { name: "Join and get 30 free boosters" })).toHaveAttribute("href", "/invite");
  });

  it("says the link does not work, with no join link, for a null preview", () => {
    wrap(<JoinLanding code="NOPE" preview={null} />);
    expect(screen.getByText("This invite link doesn't work")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a 20-char username with no cards without the fan", () => {
    const name = "a".repeat(20);
    wrap(<JoinLanding code="ABCD2345" preview={preview({ username: name, cards: [] })} />);
    expect(screen.getByText(`${name} invited you to Kizuna`)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("join page", () => {
  it("sends a signed-in player home", async () => {
    session.user = { id: "u1" };
    session.player = { id: "u1" };
    await expect(runContent("ABCD2345")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("previews the code for a signed-out visitor", async () => {
    rpc.mockResolvedValue({ data: preview(), error: null });
    await runContent("ABCD2345");
    expect(redirect).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("referral_preview", { p_code: "ABCD2345" });
  });
});
