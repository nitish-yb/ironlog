import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IronLog Workout Tracker",
    short_name: "IronLog",
    description: "Private, offline-first workout tracking.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b0a",
    theme_color: "#b9ff66",
    orientation: "portrait",
    icons: [
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
