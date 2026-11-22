import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ rpc }) }));

import { WikiIndex, type WikiIndexResult } from "@/components/wiki/WikiIndex";

const row = (n: number, unlocked = true) => ({
  id: n,
  source_id: 1000 + n,
  number: n,
  name: `Char ${n}`,
  series_title: "Series",
  rarity: "rare" as const,
  image_url: null,
  unlocked,
});

const initial: WikiIndexResult = {
  total: 6736,
  unlocked: 1143,
  matches: 130,
  rows: [row(1, false), ...Array.from({ length: 59 }, (_, i) => row(i + 2))],
};

const wrap = (data: WikiIndexResult, q?: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <WikiIndex initial={data} initialQuery={q} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WikiIndex", () => {
  it("shows the header counts", () => {
    wrap(initial);
    const pill = screen.getByText("1,143").parentElement!;
    expect(pill).toHaveTextContent("1,143 pages unlocked out of 6,736.");
    expect(screen.getByText("1,143").tagName).toBe("STRONG");
  });

  it("greys out locked tiles and shows a lock icon", () => {
    wrap(initial);
    const tile = screen.getByRole("link", { name: /Char 1\b/ });
    expect(tile).toHaveAttribute("href", "/wiki/1001");
    expect(tile.querySelector(".grayscale")).not.toBeNull();
    expect(tile.querySelector("svg.lucide-lock")).not.toBeNull();
    const open = screen.getByRole("link", { name: /Char 2\b/ });
    expect(open.querySelector(".grayscale")).toBeNull();
    expect(open.querySelector("svg.lucide-lock")).toBeNull();
    expect(open).toHaveTextContent("Series · #0002");
  });

  it("searches once after the debounce, from offset 0", async () => {
    rpc.mockResolvedValue({ data: { ...initial, matches: 1, rows: [row(9)] }, error: null });
    wrap(initial);
    fireEvent.change(screen.getByPlaceholderText("Character or universe"), { target: { value: "gojo" } });
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("wiki_index", expect.objectContaining({ p_query: "gojo", p_offset: 0 }));
    expect(screen.getByText("Char 9")).toBeInTheDocument();
  });

  it("filters to unlocked pages only", async () => {
    rpc.mockResolvedValue({ data: initial, error: null });
    wrap(initial);
    const toggle = screen.getByRole("button", { name: "Unlocked pages only" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(rpc).toHaveBeenCalledWith("wiki_index", expect.objectContaining({ p_unlocked_only: true, p_offset: 0 }));
  });

  it("shows more and appends", async () => {
    rpc.mockResolvedValue({ data: { ...initial, rows: [row(61), row(62)] }, error: null });
    wrap(initial);
    fireEvent.click(screen.getByRole("button", { name: "Show more · 70 left" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rpc).toHaveBeenCalledWith("wiki_index", expect.objectContaining({ p_offset: 60 }));
    expect(screen.getByText("Char 1")).toBeInTheDocument();
    expect(screen.getByText("Char 62")).toBeInTheDocument();
  });

  it("hides Show more when everything is loaded", () => {
    wrap({ ...initial, matches: 60 });
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  it("says when no character matches", () => {
    wrap({ ...initial, matches: 0, rows: [] }, "zzz");
    expect(screen.getByText("No character matches your search.")).toBeInTheDocument();
  });

  it("shows no empty line while there are matches", () => {
    wrap(initial);
    expect(screen.queryByText("No character matches your search.")).toBeNull();
  });

  it("prefills the input from the initial query", () => {
    wrap(initial, "One Punch Man");
    expect(screen.getByPlaceholderText("Character or universe")).toHaveValue("One Punch Man");
  });
});

describe("WikiIndex consistency", () => {
  const type = (v: string) =>
    fireEvent.change(screen.getByPlaceholderText("Character or universe"), { target: { value: v } });
  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("rapid typing makes exactly one call", async () => {
    rpc.mockResolvedValue({ data: initial, error: null });
    wrap(initial);
    for (const v of ["g", "go", "goj", "gojo"]) {
      type(v);
      await tick(50);
    }
    await tick(300);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("wiki_index", expect.objectContaining({ p_query: "gojo" }));
  });

  it("ignores an out-of-order response", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)));
    rpc.mockResolvedValueOnce({ data: { ...initial, matches: 1, rows: [row(20)] }, error: null });
    wrap(initial);
    type("a");
    await tick(300);
    type("ab");
    await tick(300);
    expect(screen.getByText("Char 20")).toBeInTheDocument();
    await act(async () => {
      resolveFirst({ data: { ...initial, matches: 1, rows: [row(200)] }, error: null });
    });
    expect(screen.getByText("Char 20")).toBeInTheDocument();
    expect(screen.queryByText("Char 200")).toBeNull();
  });

  it("drops a slow response that lands during the debounce window", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)));
    wrap(initial);
    type("a");
    await tick(300);
    type("ab");
    await act(async () => {
      resolveFirst({ data: { ...initial, matches: 1, rows: [row(200)] }, error: null });
    });
    expect(screen.queryByText("Char 200")).toBeNull();
  });

  it("a query change after Show more restarts at offset 0, and Show more keeps the shown query", async () => {
    rpc.mockResolvedValueOnce({ data: { ...initial, rows: [row(61)] }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    rpc.mockResolvedValueOnce({ data: { ...initial, rows: [row(62)] }, error: null });
    wrap(initial, "abc");
    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));
    await tick(0);
    expect(rpc).toHaveBeenLastCalledWith("wiki_index", expect.objectContaining({ p_query: "abc", p_offset: 60 }));
    type("xyz");
    await tick(300);
    expect(rpc).toHaveBeenLastCalledWith("wiki_index", expect.objectContaining({ p_query: "xyz", p_offset: 0 }));
    // search failed: rows still belong to "abc", so Show more must keep using it
    fireEvent.click(screen.getByRole("button", { name: /Show more/ }));
    await tick(0);
    expect(rpc).toHaveBeenLastCalledWith("wiki_index", expect.objectContaining({ p_query: "abc", p_offset: 61 }));
  });
});
