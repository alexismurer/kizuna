import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const jar = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (jar.value ? { value: jar.value } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc }) }));
vi.mock("@/components/referrals/InviteForm", () => ({ InviteForm: () => null }));

import InvitePage from "@/app/[locale]/(main)/invite/page";

async function runContent() {
  const page = InvitePage() as ReactElement<{ children: ReactElement }>;
  // page → AuthShell → Suspense → content
  const content = (page.props.children as ReactElement<{ children: ReactElement }>).props.children;
  expect(isValidElement(content)).toBe(true);
  const Content = content.type as (p: unknown) => Promise<ReactElement<Record<string, unknown>>>;
  return (await Content(content.props)).props;
}

beforeEach(() => {
  rpc.mockReset();
  jar.value = undefined;
});

describe("invite page", () => {
  it("passes no referral and no error without a cookie", async () => {
    expect(await runContent()).toEqual({ referral: null, initialError: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the inviter for a cookie code that previews", async () => {
    jar.value = "ABCD2345";
    rpc.mockResolvedValue({ data: { username: "Alex" }, error: null });
    expect(await runContent()).toEqual({
      referral: { code: "ABCD2345", username: "Alex" },
      initialError: null,
    });
  });

  it("flags invalid_invite when the cookie code no longer previews", async () => {
    jar.value = "ZZZZZZZZ";
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await runContent()).toEqual({ referral: null, initialError: "errors.invalid_invite" });
  });
});
