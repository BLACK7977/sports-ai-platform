import { Geist, Geist_Mono, Space_Grotesk, Rajdhani } from "next/font/google";
import { siteMetadata } from "@/lib/site-config";
import { LuminousCursor } from "@/components/layout/luminous-cursor";
import "./globals.css";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${rajdhani.variable} dark h-full antialiased`}
    >
      <body className="min-h-dvh bg-[#040a12] text-slate-100">
        {children}
        <LuminousCursor />
      </body>
    </html>
  );
}
