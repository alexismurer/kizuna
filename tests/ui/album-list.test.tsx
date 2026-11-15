import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { AlbumList, type Album } from "@/components/AlbumList";
import messages from "../../messages/en.json";

const albums: Album[] = [
  { seriesId: 1, title: "Alpha", coverUrl: null, owned: 2, total: 10, byRarity: { common: [2, 8], rare: [0, 2] } },
  { seriesId: 2, title: "Bravo", coverUrl: null, owned: 5, total: 10, byRarity: { common: [5, 10] } },
  { seriesId: 3, title: "Charlie", coverUrl: null, owned: 4, total: 4, byRarity: { common: [4, 4] } },
];

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AlbumList albums={albums} />
    </NextIntlClientProvider>,
  );
}
const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

afterEach(cleanup);

describe("AlbumList", () => {
  it("sorts by most complete", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "complete" } });
    expect(titles()).toEqual(["Charlie", "Bravo", "Alpha"]);
  });
  it("hides incomplete albums under Complete", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(titles()).toEqual(["Charlie"]);
  });
  it("shows only incomplete under To complete", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "To complete" }));
    expect(titles()).not.toContain("Charlie");
  });
});
