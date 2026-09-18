import type { Metadata } from "next";

export const siteConfig = {
  name: "NYVORX",
  description: "Sports Intelligence — análisis deportivo y predicciones basadas en datos.",
  descriptor: "Sports Intelligence",
};

export const siteMetadata: Metadata = {
  title: {
    default: "NYVORX — Sports Intelligence",
    template: "%s — NYVORX",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  icons: {
    icon: [
      { url: "/brand/nyvorx-favicon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/nyvorx-favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/nyvorx-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/nyvorx-favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/brand/nyvorx-favicon-32.png",
    apple: [
      { url: "/brand/nyvorx-app-icon.png", sizes: "1024x1024", type: "image/png" },
      { url: "/brand/nyvorx-favicon-256.png", sizes: "256x256", type: "image/png" },
    ],
  },
};
