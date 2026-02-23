import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "NeuralClub",
  description: "One-click NeuralClaw deployment",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${space.variable} ${jetbrains.variable}`}>{children}</body>
    </html>
  );
}
