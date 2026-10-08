import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-body",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ReaLMM console",
  description: "Playground client for the ReaLMM gateway. Provider keys stay in .env.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`} style={{ colorScheme: "dark" }}>
      <body>{children}</body>
    </html>
  );
}
