import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : JSON.stringify(href)} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace, refresh: vi.fn() }),
}));

import { CollectionHeader } from "@/components/collection/CollectionHeader";
import { CollectionToolbar } from "@/components/collection/CollectionToolbar";
import { parseCollectionParams, type CollectionParams } from "@/lib/game/collection";

function wrap(ui: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const SERIES = [
  { id: 2, title: "Naruto" },
  { id: 1, title: "Bleach" },
];

function toolbar(params: Partial<CollectionParams> = {}) {
  wrap(
    <CollectionToolbar
      params={{ ...parseCollectionParams({}), ...params }}
      seriesOptions={SERIES}
      wishCount={3}
      recycle={<button type="button">recycle-slot</button>}
    />,
  );
}

const lastQuery = () => replace.mock.calls.at(-1)![0].query;

beforeEach(() => replace.mockClear());
afterEach(cleanup);

describe("CollectionHeader", () => {
  it("shows unique, completion and duplicates", () => {
    wrap(<CollectionHeader unique={1945} total={5000} duplicates={23} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My collection");
    expect(screen.getByText("1945")).toBeInTheDocument();
    expect(screen.getByText("/5000")).toBeInTheDocument();
    expect(screen.getByText("39%")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });
});

describe("CollectionToolbar", () => {
  it("toggles a rarity dot in the URL", () => {
    toolbar();
    fireEvent.click(screen.getByRole("button", { name: "Epic" }));
    expect(lastQuery()).toEqual({ r: "epic" });
  });

  it("clears the rarity when its dot is pressed again", () => {
    toolbar({ rarity: "epic" });
    const epic = screen.getByRole("button", { name: "Epic" });
    expect(epic).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(epic);
    expect(lastQuery()).toEqual({});
  });

  it("badges the filters button with the active filter count", () => {
    toolbar({ show: "missing", sort: "name" });
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("2");
  });

  it("applies and resets filters", () => {
    toolbar({ q: "kid" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Duplicates" }));
    fireEvent.change(within(panel).getByLabelText("Sort"), { target: { value: "rarity" } });
    fireEvent.change(within(panel).getByLabelText("Series"), { target: { value: "2" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply" }));
    expect(lastQuery()).toEqual({ q: "kid", show: "duplicates", sort: "rarity", series: "2" });
  });

  it("reset keeps only the search", () => {
    toolbar({ q: "kid", show: "missing", rarity: "rare" });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Filters" })).getByRole("button", { name: "Reset" }));
    expect(lastQuery()).toEqual({ q: "kid" });
  });

  it("lists My wishes with its count and series A to Z", () => {
    toolbar();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    expect(within(panel).getByRole("radio", { name: "My wishes (3)" })).toBeInTheDocument();
    const options = within(within(panel).getByLabelText("Series")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["All series", "Bleach", "Naruto"]);
  });

  it("switches to albums", () => {
    toolbar();
    fireEvent.click(screen.getByRole("radio", { name: "Albums" }));
    expect(lastQuery()).toEqual({ view: "albums" });
  });

  it("searches on submit", () => {
    toolbar({ rarity: "epic" });
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "luffy" } });
    fireEvent.submit(input.closest("form")!);
    expect(lastQuery()).toEqual({ r: "epic", q: "luffy" });
  });

  it("renders the recycle slot", () => {
    toolbar();
    expect(screen.getByRole("button", { name: "recycle-slot" })).toBeInTheDocument();
  });
});
