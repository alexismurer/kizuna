import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimerBar } from "@/components/arcade/quiz/QuizParts";
import type { QuizView } from "@/lib/arcade/quiz/engine";

afterEach(cleanup);

const v = (askedMsAgo: number, index = 0): QuizView => ({
  index, total: 10, options: [], slots: 1, cards: 3, askedMsAgo, answered: null, score: 0, over: false,
});
const anim = (c: HTMLElement) => (c.querySelector("[data-timer]") as HTMLElement).style.animation;

describe("TimerBar", () => {
  it("keeps its duration when a later view of the same question arrives", () => {
    const { container, rerender } = render(<TimerBar view={v(0)} windowMs={12_000} color="red" />);
    expect(anim(container)).toContain("12000ms");
    rerender(<TimerBar view={v(4000)} windowMs={12_000} color="red" />);
    expect(anim(container)).toContain("12000ms");
  });
  it("starts again on the next question", () => {
    const { container, rerender } = render(<TimerBar view={v(0)} windowMs={12_000} color="red" />);
    rerender(<TimerBar view={v(500, 1)} windowMs={12_000} color="red" />);
    expect(anim(container)).toContain("11500ms");
  });
});
