import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
const inIds = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    rpc,
    from: () => ({ select: () => ({ in: (...a: unknown[]) => inIds(...a) }) }),
  }),
}));
vi.mock("@/components/social/ProfileHeader", () => ({ ProfileHeader: () => null }));
vi.mock("@/components/social/Showcase", () => ({ ProfileTabs: () => null }));

import ProfilePage from "@/app/[locale]/(main)/profile/[username]/page";

// The page wraps an async server component in Suspense: dig it out and run it.
async function runContent(username: string) {
  const page = (await ProfilePage({
    params: Promise.resolve({ locale: "en", username }),
  } as never)) as ReactElement<{ children: ReactElement<{ children: ReactElement }> }>;
  const content = page.props.children.props.children;
  expect(isValidElement(content)).toBe(true);
  const Content = content.type as (p: unknown) => Promise<unknown>;
  return Content(content.props);
}

beforeEach(() => {
  rpc.mockReset();
  notFound.mockClear();
});

describe("profile page", () => {
  it("is a 404 when public_profile finds no such player", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(runContent("nobody")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(rpc).toHaveBeenCalledWith("public_profile", { p_username: "nobody" });
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("is a 404, not a throw, for a malformed percent escape", async () => {
    await expect(runContent("100%")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("decodes an encoded username", async () => {
    rpc.mockResolvedValue({ data: { username: "a#b", isMe: false, showcase: [], wishlist: [], recentPulls: [] }, error: null });
    await runContent("a%23b");
    expect(rpc).toHaveBeenCalledWith("public_profile", { p_username: "a#b" });
  });

  it("adds each shown card's source id for its wiki link", async () => {
    const showcase = [{ id: 7 }];
    const recentPulls = [{ card: { id: 7 } }, { card: { id: 9 } }];
    rpc.mockResolvedValue({
      data: { username: "sakura", isMe: false, showcase, wishlist: [], recentPulls },
      error: null,
    });
    inIds.mockResolvedValue({ data: [{ id: 7, source_id: 81929 }, { id: 9, source_id: 17 }], error: null });
    await runContent("sakura");
    expect(inIds).toHaveBeenCalledWith("id", [7, 9]);
    expect(showcase[0]).toHaveProperty("sourceId", 81929);
    expect(recentPulls[1].card).toHaveProperty("sourceId", 17);
  });

  it("renders for a known player", async () => {
    rpc.mockResolvedValue({
      data: { username: "sakura", isMe: false, showcase: [], wishlist: [], recentPulls: [] },
      error: null,
    });
    await runContent("sakura");
    expect(notFound).not.toHaveBeenCalled();
  });
});
