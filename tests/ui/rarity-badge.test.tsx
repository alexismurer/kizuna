import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { RarityBadge } from "@/components/RarityBadge";
import messages from "../../messages/en.json";

describe("RarityBadge", () => {
  it("renders the letter with a translated label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RarityBadge rarity="epic" />
      </NextIntlClientProvider>,
    );
    const badge = screen.getByLabelText("Epic");
    expect(badge).toHaveTextContent("E");
  });
});
