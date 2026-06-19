import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://tradingosapp.com"),
  title: "Trading OS — premium desktop trading terminal",
  description:
    "Trading OS is the desktop terminal for serious traders. Same Supabase brain, same AXE memory — built for the desk.",
  applicationName: "Trading OS",
  manifest: "/manifest.json",
  icons: {
    icon: "/trading-os-logo.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Trading OS",
    description: "Premium desktop trading terminal — private beta.",
    images: ["/trading-os-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-svh overflow-x-hidden">{children}</body>
    </html>
  );
}
