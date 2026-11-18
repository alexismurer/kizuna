import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kizuna",
    short_name: "Kizuna",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
