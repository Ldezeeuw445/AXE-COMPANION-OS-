import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AXE Companion Final Launch",
  description:
    "Private interactive final launch preview with iPhone and iPad mock demos.",
  // robots.txt asks crawlers to stay away; this tells them. A page linked
  // from anywhere else can still be indexed despite a Disallow, because
  // robots.txt governs crawling and not indexing. A draft landing page must
  // never turn up in a search result for the product.
  robots: { index: false, follow: false },
};

export default function FinalLaunchPage() {
  return (
    <main className="min-h-dvh bg-[#07080a]">
      <iframe
        title="AXE Companion Final Launch Preview"
        src="/finallaunch/index.html"
        className="h-dvh w-full border-0"
        loading="eager"
      />
    </main>
  );
}
