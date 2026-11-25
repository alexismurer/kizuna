// Cosmetics bought at the prize counter. Ids are prize ids; names live in
// messages under cosmetics.titles / frames / banners / names.<id>.

export type FrameStyle = "gold" | "neon" | "sakura" | "ember" | "frost" | "prism";

export const FRAMES: Record<string, FrameStyle> = {
  frame_gold: "gold",
  frame_neon: "neon",
  frame_sakura: "sakura",
  frame_ember: "ember",
  frame_frost: "frost",
  frame_prism: "prism",
};

// each title has its own colour
export const TITLES: Record<string, { color: string }> = {
  title_pillar: { color: "#f5c542" },
  title_arcade: { color: "#38d5ff" },
  title_ace21: { color: "#6aa8ff" },
  title_eagle: { color: "#ffd84d" },
  title_memory: { color: "#ff7ac8" },
  title_encyclopedia: { color: "#ffb38a" },
  title_explorer: { color: "#7be0a4" },
  title_fusion: { color: "#c48bff" },
  title_peak: { color: "#9fd6ff" },
  title_daily: { color: "#ff9a62" },
  title_raid: { color: "#ff5a5a" },
  title_collector: { color: "#ffe08a" },
};

// profile banners: drawn in CSS (.banner-<style> in globals.css)
export type BannerStyle = "dusk" | "neon" | "stars" | "ink" | "inferno";

export const BANNERS: Record<string, BannerStyle> = {
  banner_dusk: "dusk",
  banner_neon: "neon",
  banner_stars: "stars",
  banner_ink: "ink",
  banner_inferno: "inferno",
};

// name styles for the username: CSS classes .name-<style>
export type NameStyle = "gold" | "prism" | "frost" | "shadow";

export const NAMES: Record<string, NameStyle> = {
  name_gold: "gold",
  name_prism: "prism",
  name_frost: "frost",
  name_shadow: "shadow",
};

export const frameStyle = (id: string | null | undefined): FrameStyle | null => (id ? (FRAMES[id] ?? null) : null);
export const bannerStyle = (id: string | null | undefined): BannerStyle | null => (id ? (BANNERS[id] ?? null) : null);
export const nameStyle = (id: string | null | undefined): NameStyle | null => (id ? (NAMES[id] ?? null) : null);
