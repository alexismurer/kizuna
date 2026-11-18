import { describe, expect, it } from "vitest";
import { beamRarity, boosterTitle, flipFx, packVariant, sequenceMs } from "@/lib/opening/tear";

describe("tear sequence", () => {
  it("shows the golden / divine variant only once the strip is gone", () => {
    expect(packVariant("golden", false)).toBeNull();
    expect(packVariant("golden", true)).toBe("golden");
    expect(packVariant("divine", true)).toBe("divine");
    expect(packVariant(null, true)).toBeNull();
  });

  it("keeps the beam white until the strip is gone, then takes the best rarity (Rare or better)", () => {
    expect(beamRarity("legendary", false)).toBeNull();
    expect(beamRarity("legendary", true)).toBe("legendary");
    expect(beamRarity("rare", true)).toBe("rare");
    expect(beamRarity("mythic", true)).toBe("mythic");
    expect(beamRarity("uncommon", true)).toBeNull();
    expect(beamRarity("common", true)).toBeNull();
    expect(beamRarity(null, true)).toBeNull();
  });

  it("plays longer for a golden / divine batch", () => {
    expect(sequenceMs("golden")).toBeGreaterThan(sequenceMs(null));
    expect(sequenceMs("divine")).toBe(sequenceMs("golden"));
  });
});

describe("reveal effects", () => {
  it("titles only golden / divine batches, only with animations on; divine wins", () => {
    expect(boosterTitle(true, false, true)).toBe("golden");
    expect(boosterTitle(false, true, true)).toBe("divine");
    expect(boosterTitle(true, true, true)).toBe("divine");
    expect(boosterTitle(false, false, true)).toBeNull();
    expect(boosterTitle(true, false, false)).toBeNull();
  });

  it("bursts only Epic or better, only with animations on", () => {
    expect(flipFx("epic", true)).toBe(true);
    expect(flipFx("legendary", true)).toBe(true);
    expect(flipFx("mythic", true)).toBe(true);
    expect(flipFx("rare", true)).toBe(false);
    expect(flipFx("common", true)).toBe(false);
    expect(flipFx("epic", false)).toBe(false);
  });
});
