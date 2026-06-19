import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerInit } from "@/components/push/ServiceWorkerInit";
import { getPublicAppBaseUrl } from "@/lib/env";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppBaseUrl()),
  title: "Trading OS",
  description:
    "Private AI trading companion — chat, alerts, vault, and guarded approvals.",
  applicationName: "Trading OS",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Trading OS",
    statusBarStyle: "black-translucent",
    startupImage: "/trading-os-icon-512.png",
  },
  icons: {
    apple: "/trading-os-icon-512.png",
    icon: "/trading-os-icon-512.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-svh overflow-x-hidden font-normal">
        <ServiceWorkerInit />
        {children}
      </body>
    </html>
  );
}
