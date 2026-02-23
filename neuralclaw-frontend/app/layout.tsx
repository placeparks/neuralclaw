import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuralClaw Cloud Deploy",
  description: "Deploy your own NeuralClaw bot in minutes"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
