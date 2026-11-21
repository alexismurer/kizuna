import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createFormatter, createTranslator } from "use-intl/core";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationList } from "@/components/notifications/NotificationList";
import { ReferralLink } from "@/components/referrals/ReferralLink";
import { ReferralList, type Invited } from "@/components/referrals/ReferralList";
import { referralUrl } from "@/lib/referrals/link";
import { copyOrShare } from "@/lib/referrals/share";
import messages from "../../messages/en.json";

const rpc = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "kizuna.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (ns: string) => createTranslator({ locale: "en", messages, namespace: ns as never }),
  getFormatter: async () => createFormatter({ locale: "en" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import InviteFriendsPage from "@/app/[locale]/(main)/invite-friends/page";

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const setNav = (props: Record<string, unknown>) => {
  for (const k of ["share", "clipboard"]) Object.defineProperty(navigator, k, { value: undefined, configurable: true });
  for (const [k, v] of Object.entries(props)) Object.defineProperty(navigator, k, { value: v, configurable: true });
};

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  setNav({});
});

describe("share helpers", () => {
  it("builds the join url", () => {
    expect(referralUrl("https://x.app", "ABCD2345")).toBe("https://x.app/join/ABCD2345");
  });

  it("shares with text and url when the share sheet exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav({ share });
    await expect(copyOrShare("https://x/join/A", "hi", "share")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hi" });
  });

  it("a cancelled share sheet is neither a fallback nor a copy", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    setNav({ share });
    await expect(copyOrShare("u", "t", "share")).resolves.toBe("cancelled");
  });

  it("falls back when the clipboard rejects", async () => {
    setNav({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await expect(copyOrShare("u", "t", "copy")).resolves.toBe("fallback");
  });

  it("falls back when there is no clipboard", async () => {
    await expect(copyOrShare("u", "t", "copy")).resolves.toBe("fallback");
  });

  it("copies the url", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav({ clipboard: { writeText } });
    await expect(copyOrShare("u", "t", "copy")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("u");
  });
});

describe("ReferralLink", () => {
  it("shows the link and confirms a copy", async () => {
    setNav({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    wrap(<ReferralLink code="ABCD2345" origin="https://x.app" />);
    expect(screen.getByRole("textbox")).toHaveValue("https://x.app/join/ABCD2345");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    expect(screen.getByText("Link copied")).toBeInTheDocument();
  });

  it("selects the read-only field when copying fails", async () => {
    wrap(<ReferralLink code="ABCD2345" origin="https://x.app" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
    const field = screen.getByRole("textbox") as HTMLInputElement;
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(screen.queryByText("Link copied")).toBeNull();
  });

  it("hides Share without navigator.share and when share is false", () => {
    wrap(<ReferralLink code="ABCD2345" origin="https://x.app" />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    cleanup();
    setNav({ share: vi.fn() });
    wrap(<ReferralLink code="ABCD2345" origin="https://x.app" />);
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    cleanup();
    wrap(<ReferralLink code="ABCD2345" origin="https://x.app" share={false} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });
});

const invited: Invited[] = [
  { username: "Mia", avatarUrl: null, joinedAt: "2026-11-10T10:00:00Z", boostersOpened: 7, daysPlayed: 2, rewarded: false },
  { username: "Leo", avatarUrl: null, joinedAt: "2026-11-01T10:00:00Z", boostersOpened: 10, daysPlayed: 3, rewarded: true },
];

describe("ReferralList", () => {
  it("shows progress and the rewarded state", () => {
    wrap(<ReferralList invited={invited} />);
    expect(screen.getByText("7/10 boosters")).toBeInTheDocument();
    expect(screen.getByText("2/3 days")).toBeInTheDocument();
    expect(screen.getByText("Rewarded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mia" })).toHaveAttribute("href", "/profile/Mia");
  });

  it("invites sharing when empty", () => {
    wrap(<ReferralList invited={[]} />);
    expect(screen.getByText("No one yet — share your link")).toBeInTheDocument();
  });
});

describe("invite friends page", () => {
  it("shows totals, the 3 steps and a link on the request origin", async () => {
    rpc.mockResolvedValue({
      data: {
        code: "ABCD2345",
        invited: [invited[1]],
        totals: { joined: 1, rewarded: 1, boostersEarned: 3, currencyEarned: 500 },
      },
      error: null,
    });
    const page = (await InviteFriendsPage({ params: Promise.resolve({ locale: "en" }) } as never)) as ReactElement<{
      children: ReactElement[];
    }>;
    const suspense = page.props.children[1] as ReactElement<{ children: ReactElement }>;
    const content = suspense.props.children;
    expect(isValidElement(content)).toBe(true);
    const Content = content.type as (p: unknown) => Promise<ReactElement>;
    wrap(await Content(content.props));
    expect(screen.getByText(/\+3 boosters · \+500/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.closest("ol"))).toHaveLength(3);
    expect(screen.getByRole("textbox")).toHaveValue("https://kizuna.test/join/ABCD2345");
    expect(screen.getByText(/3 different days/)).toBeInTheDocument();
  });
});

describe("referral notifications", () => {
  const n = (id: number, kind: string, payload: Record<string, unknown>) => ({
    id,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    read: false,
  });
  it.each([
    [n(1, "referral_joined", { username: "mika" }), "mika joined with your link", "/profile/mika"],
    [
      n(2, "referral_rewarded", { username: "mika" }),
      "mika played 10 boosters over 3 days: +3 boosters and +500 for you",
      "/invite-friends",
    ],
    [n(3, "referral_gift", { username: "mika" }), "mika sent you a gift: 3 Mix boosters", "/profile/mika"],
  ])("renders %#", (item, text, href) => {
    wrap(<NotificationList items={[item]} names={{}} onNavigate={() => {}} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(text);
    expect(link).toHaveAttribute("href", href);
  });
});
