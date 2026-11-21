import { describe, expect, it } from "vitest";
import { currentSeason, franchiseChain, matchSuggestions, seasonSlug } from "@/lib/game/seasonSuggest";

describe("currentSeason", () => {
  it("November is fall; the booster runs at least 4 weeks", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const s = currentSeason(now);
    expect([s.season, s.year]).toEqual(["FALL", 2026]);
    expect(s.endsAt.getTime()).toBe(now.getTime() + 28 * 86_400_000);
  });

  it("December is next year's winter, ending March 1", () => {
    const s = currentSeason(new Date("2026-12-02T00:00:00Z"));
    expect([s.season, s.year]).toEqual(["WINTER", 2027]);
    expect(s.endsAt.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("April is spring, ending June 1", () => {
    const s = currentSeason(new Date("2027-04-03T00:00:00Z"));
    expect([s.season, s.year]).toEqual(["SPRING", 2027]);
    expect(s.endsAt.toISOString()).toBe("2027-06-01T00:00:00.000Z");
    expect(seasonSlug(s.season, s.year)).toBe("spring_2027");
  });
});

describe("matchSuggestions", () => {
  const ups = new Map([
    [300, [200]],
    [200, [100, 150]],
    [400, [300]],
  ]);

  it("follows prequels up to the root, lowest id first", () => {
    expect(franchiseChain(400, ups)).toEqual([400, 300, 200, 100]);
  });

  it("matches a sequel to its franchise's series and skips repeats", () => {
    const series = [{ id: 9, title: "Root Show", sourceId: 100, cards: 12 }];
    const out = matchSuggestions(
      [
        { id: 300, title: "Root Show S3", cover: null, popularity: 900 },
        { id: 400, title: "Root Show S4", cover: null, popularity: 500 },
        { id: 777, title: "New Show", cover: null, popularity: 300 },
      ],
      ups,
      series,
    );
    expect(out.map((s) => [s.title, s.series?.id ?? null])).toEqual([
      ["Root Show S3", 9],
      ["New Show", null],
    ]);
  });

  it("ignores catalog series without cards", () => {
    const out = matchSuggestions([{ id: 100, title: "Root", cover: null, popularity: 1 }], ups, [
      { id: 9, title: "Root", sourceId: 100, cards: 0 },
    ]);
    expect(out[0].series).toBeNull();
  });
});
