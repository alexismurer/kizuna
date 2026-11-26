import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AwakeningCard } from "@/components/awakening/AwakeningCard";
import { isVideoUrl } from "@/lib/awakening/media";

let animations = true;
vi.mock("@/lib/fx/prefs", () => ({ usePrefs: () => [{ animations }, vi.fn()] }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => false }));

const base = { title: "The Strongest", form: "Domain Expansion", effect: "void" as const, accent: "#7c5cff", total: 30 };
const card = { name: "Gojo Satoru", image_url: "https://x/base.png" };

function show(extra: Partial<React.ComponentProps<typeof AwakeningCard>["awakening"]> = {}) {
  return render(<AwakeningCard awakening={{ ...base, ...extra }} card={card} />);
}

afterEach(() => {
  cleanup();
  animations = true;
});

describe("AwakeningCard loop", () => {
  it("shows the base art with no urls", () => {
    const { container } = show();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", card.image_url);
  });

  it("plays an mp4 loop muted and looping", () => {
    const { container } = show({ loopUrl: "https://x/a.mp4" });
    const v = container.querySelector("video")!;
    expect(v.muted).toBe(true);
    expect(v).toHaveAttribute("loop");
  });

  it("renders no video when animations are off", () => {
    animations = false;
    const { container } = show({ loopUrl: "https://x/a.mp4", posterUrl: "https://x/p.png" });
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "https://x/p.png");
  });

  it("uses a gif loop as the image", () => {
    const { container } = show({ loopUrl: "https://x/a.gif" });
    expect(container.querySelector("img")).toHaveAttribute("src", "https://x/a.gif");
  });

  it("falls back to base art for a gif loop with animations off and no poster", () => {
    animations = false;
    const { container } = show({ loopUrl: "https://x/a.gif" });
    expect(container.querySelector("img")).toHaveAttribute("src", card.image_url);
  });
});

describe("isVideoUrl", () => {
  it("matches video files ignoring the query", () => {
    expect(isVideoUrl("https://x/a.webm?t=1")).toBe(true);
    expect(isVideoUrl("https://x/a.gif")).toBe(false);
  });
});
