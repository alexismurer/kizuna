// Cosmetics bought at the prize counter. Ids are prize ids; names live in
// messages under cosmetics.titles.<id> / cosmetics.frames.<id>.

export type FrameStyle = "gold" | "neon";

export const FRAMES: Record<string, FrameStyle> = {
  frame_gold: "gold",
  frame_neon: "neon",
};

// each title has its own colour
export const TITLES: Record<string, { color: string }> = {
  title_pillar: { color: "#f5c542" },
  title_arcade: { color: "#38d5ff" },
  title_ace21: { color: "#6aa8ff" },
  title_eagle: { color: "#ffd84d" },
  title_memory: { color: "#ff7ac8" },
  title_encyclopedia: { color: "#ffb38a" },
};

export const frameStyle = (id: string | null | undefined): FrameStyle | null => (id ? (FRAMES[id] ?? null) : null);
