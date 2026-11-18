import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteForm } from "@/components/referrals/InviteForm";
import messages from "../../messages/en.json";

const rpc = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const wrap = (referral: { code: string; username: string } | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InviteForm referral={referral} />
    </NextIntlClientProvider>,
  );
const ref = { code: "ABCD2345", username: "Alex" };
const typeName = (v: string) => fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: v } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Start playing" }));

beforeEach(() => {
  rpc.mockReset();
  push.mockReset();
  refresh.mockReset();
  rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("InviteForm", () => {
  it("with a referral hides the code field and redeems the referral code", async () => {
    wrap(ref);
    expect(screen.getByText(/Invited by Alex/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Invite code")).toBeNull();
    typeName("newbie");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "ABCD2345", p_username: "newbie" });
  });

  it("Use another code redeems the typed owner code, not the cookie one", async () => {
    wrap(ref);
    fireEvent.click(screen.getByRole("button", { name: "Use another code" }));
    fireEvent.change(screen.getByPlaceholderText("Invite code"), { target: { value: "OWNER123" } });
    typeName("newbie");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "OWNER123", p_username: "newbie" });
  });

  it("without a referral joins with no code at all", async () => {
    wrap(null);
    expect(screen.queryByPlaceholderText("Invite code")).toBeNull();
    typeName("newbie");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "", p_username: "newbie" });
  });

  it("without a referral an optional code can still be entered", async () => {
    wrap(null);
    expect(screen.queryByText(/Invited by/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Have an invite code?" }));
    fireEvent.change(screen.getByPlaceholderText("Invite code"), { target: { value: "OWNER123" } });
    typeName("newbie");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "OWNER123", p_username: "newbie" });
  });

  it("shows the mapped error and the code field on invalid_invite", async () => {
    rpc.mockResolvedValue({ error: { message: "invalid_invite" } });
    wrap(ref);
    typeName("newbie");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("That invite code is not valid.");
    expect(screen.getByPlaceholderText("Invite code")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an initial error with the code field", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InviteForm referral={null} initialError="errors.invalid_invite" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("That invite code is not valid.");
    expect(screen.getByPlaceholderText("Invite code")).toBeInTheDocument();
  });

  it("clears the referral cookie after joining", async () => {
    document.cookie = "anicards_ref=ABCD2345; path=/";
    wrap(ref);
    typeName("newbie");
    submit();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(document.cookie).not.toContain("anicards_ref");
  });
});
