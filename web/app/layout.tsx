import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";

const sans = localFont({
  src: "../fonts/Outfit-Variable.ttf",
  weight: "400 600",
  variable: "--font-body",
});
const mono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ReaLMM console",
  description: "Playground client for the ReaLMM gateway. Provider keys stay in .env.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
