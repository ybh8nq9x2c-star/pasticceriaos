import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PasticceriaOS",
  description: "Il sistema operativo per la tua pasticceria",
  themeColor: "#1A2B4A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
