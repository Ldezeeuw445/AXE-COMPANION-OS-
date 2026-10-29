import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerInit } from "@/components/push/ServiceWorkerInit";
import { ShellBootScript } from "@/components/shell/ShellBootScript";
import { getPublicAppBaseUrl } from "@/lib/env";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppBaseUrl()),
  title: "AXE Companion",
  description:
    "Private AI trading companion — chat, alerts, vault, and guarded approvals.",
  applicationName: "AXE Companion",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "AXE Companion",
    statusBarStyle: "black-translucent",
    startupImage: "/axe-icon-512.png?v=3",
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
    icon: [
      { url: "/axe-icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/axe-icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-svh overflow-x-hidden font-normal">
        <ShellBootScript />
        <ServiceWorkerInit />
        {children}
      </body>
    </html>
  );
}
