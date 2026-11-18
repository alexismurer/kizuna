import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteButton } from "@/components/referrals/InviteButton";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("InviteButton", () => {
  it("is named by the full invite label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InviteButton />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: "Invite friends" })).toHaveAttribute("href", "/invite-friends");
  });
});
