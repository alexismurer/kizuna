import { duelSfx } from "@/lib/duel/sfx";

// Arcade sounds, borrowed from the Duel's set; best-effort like every sound.
export type ArcadeSfx = "deal" | "right" | "wrong" | "win" | "lose" | "tick" | "end";

const MAP = { deal: "deal", right: "roundWon", wrong: "roundLost", win: "victory", lose: "defeat", tick: "turn", end: "victory" } as const;

export function arcadeSfx(kind: ArcadeSfx, enabled: boolean) {
  duelSfx(MAP[kind], enabled);
}
