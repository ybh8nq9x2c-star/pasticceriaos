import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// UI font: Inter con feature settings da design system (cv11, ss01 in globals).
// Variable font → pesi 400-700 senza richieste extra.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BakeryOs",
    template: "%s · BakeryOs",
  },
  description: "Il sistema operativo per pasticcerie artigianali e fornitori",
  applicationName: "BakeryOs",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    title: "BakeryOs",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2D6A4F" },
    { media: "(prefers-color-scheme: dark)", color: "#131210" },
  ],
  width: "device-width",
  initialScale: 1,
  // Zoom intentionally left enabled (accessibility — do not disable pinch-zoom).
  maximumScale: 5,
  viewportFit: "cover",
};

/**
 * Applica il tema PRIMA del primo paint (niente flash light→dark).
 * Ordine: scelta esplicita utente (localStorage) → preferenza di sistema.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("bakeryos-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
