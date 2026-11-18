import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn(), getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc, auth: { getClaims: async () => ({ data: {} }) } }) }));
vi.mock("@/components/social/DmThread", () => ({ DmThread: () => null }));
vi.mock("@/components/social/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

import MessagesPage from "@/app/[locale]/(main)/messages/[username]/page";

async function runContent(username: string) {
  const page = (await MessagesPage({
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

describe("messages page", () => {
  it("is a 404, not a throw, for a malformed percent escape", async () => {
    await expect(runContent("100%")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(rpc).not.toHaveBeenCalled();
  });
});
