import { render, screen } from "@testing-library/react";
import { APP_NAME } from "@/config/app";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";

function AppName() {
  const t = useTranslations("app");
  return <span>{t("name")}</span>;
}

describe("smoke", () => {
  it("renders the translated app name", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppName />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Anicards")).toBeInTheDocument();
    expect(APP_NAME).toBe("Anicards");
  });
});
