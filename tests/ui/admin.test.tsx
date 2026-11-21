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
  adminDeleteChat: vi.fn(),
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
import { GrantPanel } from "@/components/admin/GrantPanel";
import { InvitesPanel } from "@/components/admin/InvitesPanel";
import AdminPage from "@/app/[locale]/(main)/admin/page";

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
  const fill = (u: string, a: string) => {
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: u } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: a } });
    fireEvent.click(screen.getByRole("button", { name: "Grant" }));
  };

  it("names the player, shows the new balance and clears the form", async () => {
    actions.adminGrantCurrency.mockResolvedValue({ ok: true, data: 1500 });
    wrap(<GrantPanel />);
    fill("sakura", "1000");
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
    fill("x", "5");
    expect(await screen.findByText(text)).toBeInTheDocument();
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
      <AccountMenu playerId="p" me={{ username: "a", avatar_url: null }} initialUnread={0} isAdmin={isAdmin}>
        <span />
      </AccountMenu>,
    );
  it("shows Admin only for admins", () => {
    menu(true);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    cleanup();
    menu(false);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
});

describe("admin page", () => {
  async function run() {
    const page = (await AdminPage({ params: Promise.resolve({ locale: "en" }) } as never)) as ReactElement<{
      children: ReactElement<{ children: ReactElement }>;
    }>;
    const content = page.props.children.props.children;
    expect(isValidElement(content)).toBe(true);
    return (content.type as (p: unknown) => Promise<unknown>)(content.props);
  }

  it("is a 404 for non-admins", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(rpc).toHaveBeenCalledWith("is_admin");
  });

  it("renders for admins", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "is_admin" ? true : [], error: null }));
    await run();
    expect(notFound).not.toHaveBeenCalled();
  });
});
