import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from your own domain,
// so there is no runtime request to Google and nothing to load on a slow phone.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kitchen",
  description: "What are we making today?",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kitchen" },
};

export const viewport: Viewport = {
  themeColor: "#edefea",
  width: "device-width",
  initialScale: 1,
  // Keeps iOS from zooming in when a text field is focused.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
