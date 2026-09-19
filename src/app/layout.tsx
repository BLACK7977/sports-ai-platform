import { Geist, Geist_Mono, Space_Grotesk, Rajdhani, Inter } from "next/font/google";
import type { Viewport } from "next";
import { siteMetadata } from "@/lib/site-config";
import { LuminousCursor } from "@/components/layout/luminous-cursor";
import { resolveViewerThemeForRender } from "@/lib/presentation/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = siteMetadata;

export const viewport: Viewport = {
  themeColor: "#020406",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await resolveViewerThemeForRender();
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${rajdhani.variable} dark h-full antialiased`}
    >
      <body className="min-h-dvh bg-[#020406] text-slate-100">
        {children}
        <LuminousCursor />
      </body>
    </html>
  );
}
