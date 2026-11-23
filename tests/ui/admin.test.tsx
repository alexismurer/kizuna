import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { createTranslator } from "use-intl/core";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const actions = vi.hoisted(() => ({
  adminCreateInvites: vi.fn(),
  adminRevokeInvite: vi.fn(),
  adminGrantCurrency: vi.fn(),
  adminPlayerSearch: vi.fn(),
  adminCardSearch: vi.fn(),
  adminGrantCard: vi.fn(),
  adminDeleteChat: vi.fn(),
  adminUpdatePlayer: vi.fn(),
  adminSetRole: vi.fn(),
  adminSetBan: vi.fn(),
}));
vi.mock("@/lib/actions/admin", () => actions);
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/components/social/useDmUnread", () => ({ useDmUnread: (_: unknown, n: number) => n }));
vi.mock("@/components/social/Avatar", () => ({ Avatar: () => null }));

const rpc = vi.fn();
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (ns: string) => createTranslator({ locale: "en", messages, namespace: ns as never }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc }) }));

import { AccountMenu } from "@/components/AccountMenu";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { GrantCardPanel } from "@/components/admin/GrantCardPanel";
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import { PlayersPanel } from "@/components/admin/PlayersPanel";
import type { AdminPlayers } from "@/lib/actions/admin";
import StaffPage from "@/app/[locale]/(main)/staff/page";

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset());
  rpc.mockReset();
  notFound.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(cleanup);

describe("InvitesPanel", () => {
  const invites = [
    { code: "AAAA2222", createdAt: "2026-11-01T00:00:00Z", usedBy: "sakura", usedAt: "2026-11-02T00:00:00Z" },
    { code: "BBBB3333", createdAt: "2026-11-01T00:00:00Z", usedBy: null, usedAt: null },
  ];

  it("creates 5 codes and shows them with Copy buttons", async () => {
    actions.adminCreateInvites.mockResolvedValue({ ok: true, data: ["NEW11111", "NEW22222"] });
    wrap(<InvitesPanel initial={invites} />);
    fireEvent.click(screen.getByRole("button", { name: "Create 5" }));
    expect(actions.adminCreateInvites).toHaveBeenCalledWith(5);
    expect(await screen.findByText("NEW11111")).toBeInTheDocument();
    expect(screen.getByText("NEW22222")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows who used a code and hides Revoke on used codes", () => {
    wrap(<InvitesPanel initial={invites} />);
    expect(screen.getByText("Used by sakura")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("removes a revoked code", async () => {
    actions.adminRevokeInvite.mockResolvedValue({ ok: true, data: null });
    wrap(<InvitesPanel initial={invites} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(actions.adminRevokeInvite).toHaveBeenCalledWith("BBBB3333");
    await waitFor(() => expect(screen.queryByText("BBBB3333")).not.toBeInTheDocument());
  });
});

describe("GrantPanel", () => {
  const pickPlayer = async (typed: string, name: string) => {
    fireEvent.change(screen.getByRole("combobox", { name: "Username" }), { target: { value: typed } });
    fireEvent.click(await screen.findByRole("option", { name: name }));
  };
  const fill = async (u: string, a: string) => {
    actions.adminPlayerSearch.mockResolvedValue({ ok: true, data: [{ username: u, avatarUrl: null }] });
    await pickPlayer(u.slice(0, 2), u);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: a } });
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));
  };

  it("suggests players while typing and only grants to a picked one", async () => {
    actions.adminPlayerSearch.mockResolvedValue({
      ok: true,
      data: [
        { username: "sakura", avatarUrl: null },
        { username: "sakuya", avatarUrl: null },
      ],
    });
    wrap(<GrantPanel />);
    expect(screen.getByRole("button", { name: "Grant" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Username" }), { target: { value: "sak" } });
    expect(await screen.findByRole("option", { name: "sakuya" })).toBeInTheDocument();
    expect(actions.adminPlayerSearch).toHaveBeenCalledWith("sak");
    fireEvent.click(screen.getByRole("option", { name: "sakura" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("sakura")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grant" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("combobox", { name: "Username" })).toBeInTheDocument();
  });

  it("picks with arrow keys and Enter", async () => {
    actions.adminPlayerSearch.mockResolvedValue({
      ok: true,
      data: [
        { username: "sakura", avatarUrl: null },
        { username: "sakuya", avatarUrl: null },
      ],
    });
    wrap(<GrantPanel />);
    const box = screen.getByRole("combobox", { name: "Username" });
    fireEvent.change(box, { target: { value: "sak" } });
    await screen.findByRole("option", { name: "sakuya" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByText("sakuya")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says when nobody matches", async () => {
    actions.adminPlayerSearch.mockResolvedValue({ ok: true, data: [] });
    wrap(<GrantPanel />);
    const box = screen.getByRole("combobox", { name: "Username" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText("No match.")).toBeInTheDocument();
  });

  it("names the player, shows the new balance and clears the form", async () => {
    actions.adminGrantCurrency.mockResolvedValue({ ok: true, data: 1500 });
    wrap(<GrantPanel />);
    await fill("sakura", "1000");
    expect(await screen.findByText("Sent 1,000 to sakura — new balance 1,500")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue(null);
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("step", "1");
    expect(actions.adminGrantCurrency).toHaveBeenCalledWith("sakura", 1000, null);
  });

  it.each([
    ["player_not_found", "No player with that username."],
    ["invalid_amount", "The amount must be between 1 and 1,000,000."],
  ])("translates %s", async (code, text) => {
    actions.adminGrantCurrency.mockResolvedValue({ ok: false, error: code });
    wrap(<GrantPanel />);
    await fill("xavier", "5");
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});

describe("GrantCardPanel", () => {
  const card = { id: 42, number: 7, name: "Levi", imageUrl: null, rarity: "mythic", seriesTitle: "Attack on Titan" };

  it("picks a player and a card, then gives copies", async () => {
    actions.adminPlayerSearch.mockResolvedValue({ ok: true, data: [{ username: "sakura", avatarUrl: null }] });
    actions.adminCardSearch.mockResolvedValue({ ok: true, data: [card] });
    actions.adminGrantCard.mockResolvedValue({ ok: true, data: 3 });
    wrap(<GrantCardPanel />);
    expect(screen.getByRole("button", { name: "Give" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Username" }), { target: { value: "sa" } });
    fireEvent.click(await screen.findByRole("option", { name: "sakura" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Card" }), { target: { value: "lev" } });
    const opt = await screen.findByRole("option", { name: /Levi/ });
    expect(opt).toHaveTextContent("#7 · Attack on Titan");
    fireEvent.click(opt);
    fireEvent.change(screen.getByLabelText("Copies"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Give" }));
    expect(await screen.findByText("Gave 2 × Levi to sakura — they now own 3")).toBeInTheDocument();
    expect(actions.adminGrantCard).toHaveBeenCalledWith("sakura", 42, 2, null);
  });

  it("translates card errors", async () => {
    actions.adminPlayerSearch.mockResolvedValue({ ok: true, data: [{ username: "sakura", avatarUrl: null }] });
    actions.adminCardSearch.mockResolvedValue({ ok: true, data: [card] });
    actions.adminGrantCard.mockResolvedValue({ ok: false, error: "invalid_copies" });
    wrap(<GrantCardPanel />);
    fireEvent.change(screen.getByRole("combobox", { name: "Username" }), { target: { value: "sa" } });
    fireEvent.click(await screen.findByRole("option", { name: "sakura" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Card" }), { target: { value: "lev" } });
    fireEvent.click(await screen.findByRole("option", { name: /Levi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Give" }));
    expect(await screen.findByText("Copies must be between 1 and 100.")).toBeInTheDocument();
  });
});

describe("ChatPanel", () => {
  it("lists messages and drops one after Delete", async () => {
    actions.adminDeleteChat.mockResolvedValue({ ok: true, data: null });
    wrap(
      <ChatPanel
        initial={[
          { id: 2, room: "market", author: "sakura", body: "hello there", createdAt: "2026-11-02T00:00:00Z" },
          { id: 1, room: "market", author: "rin", body: "spam spam", createdAt: "2026-11-01T00:00:00Z" },
        ]}
      />,
    );
    expect(screen.getByText("hello there")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(actions.adminDeleteChat).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText("spam spam")).not.toBeInTheDocument());
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });
});

describe("AccountMenu", () => {
  const menu = (isAdmin?: boolean) =>
    wrap(
      <AccountMenu playerId="p" me={{ username: "a", avatar_url: null }} initialUnread={0} isStaff={isAdmin}>
        <span />
      </AccountMenu>,
    );
  it("shows the Staff panel link only for staff", () => {
    menu(true);
    expect(screen.getByRole("link", { name: "Staff panel" })).toHaveAttribute("href", "/staff");
    cleanup();
    menu(false);
    expect(screen.queryByRole("link", { name: "Staff panel" })).not.toBeInTheDocument();
  });
});

describe("staff page", () => {
  async function run() {
    const page = (await StaffPage({ params: Promise.resolve({ locale: "en" }) } as never)) as ReactElement<{
      children: ReactElement<{ children: ReactElement }>;
    }>;
    const content = page.props.children.props.children;
    expect(isValidElement(content)).toBe(true);
    return (content.type as (p: unknown) => Promise<unknown>)(content.props);
  }

  it("is a 404 for players", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(rpc).toHaveBeenCalledWith("my_role");
  });

  it("renders every section for admins", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "my_role" ? "admin" : fn === "admin_players" ? null : [], error: null }));
    wrap((await run()) as React.ReactNode);
    expect(notFound).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("admin_invites");
    expect(screen.getByRole("heading", { name: "Grant currency" })).toBeInTheDocument();
  });

  it("gives moderators players, seasonals, pools and chat only, read-only", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "my_role" ? "moderator" : fn === "admin_players" ? null : [], error: null }));
    wrap((await run()) as React.ReactNode);
    expect(rpc).not.toHaveBeenCalledWith("admin_invites");
    expect(screen.getByText("Moderator")).toBeInTheDocument();
    for (const name of ["Invite codes", "Grant currency", "Give a card"]) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Seasonal boosters" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save pool" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggest from airing anime/ })).not.toBeInTheDocument();
  });
});

describe("PlayersPanel", () => {
  const data: AdminPlayers = {
    catalogSize: 100,
    totals: { players: 1, active24h: 1, active7d: 1, new7d: 1, referred: 0, boostersOpened: 3 },
    players: [
      {
        id: "p1", username: "kenji", avatarUrl: null, role: "player", bannedAt: null, joinedAt: "2026-11-01T00:00:00Z",
        lastSeenAt: null, currency: 50, uniqueCards: 10, totalCards: 12, boostersOpened: 3, streak: 2, logins: 4,
        invited: 0, invitedRewarded: 0, referredBy: null,
      },
    ],
  };

  it("shows the role and no edit button for moderators", () => {
    wrap(<PlayersPanel data={data} />);
    expect(screen.getAllByText("Player")).toHaveLength(2); // the column and the role badge
    expect(screen.queryByRole("button", { name: "Edit kenji" })).not.toBeInTheDocument();
  });

  it("lets admins edit fields, change the role and ban in two steps", async () => {
    actions.adminUpdatePlayer.mockResolvedValue({ ok: true, data: null });
    actions.adminSetRole.mockResolvedValue({ ok: true, data: null });
    actions.adminSetBan.mockResolvedValue({ ok: true, data: null });
    wrap(<PlayersPanel data={data} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Edit kenji" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Currency" }), { target: { value: "900" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Role" }), { target: { value: "moderator" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    expect(actions.adminUpdatePlayer).toHaveBeenCalledWith("p1", "kenji", 900, 2);
    expect(actions.adminSetRole).toHaveBeenCalledWith("p1", "moderator");

    await waitFor(() => expect(screen.getByRole("button", { name: "Ban" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Ban" }));
    expect(actions.adminSetBan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, ban kenji" }));
    await waitFor(() => expect(actions.adminSetBan).toHaveBeenCalledWith("p1", true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unban" })).toBeInTheDocument());
  });
});
