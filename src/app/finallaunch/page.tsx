import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AXE Companion Final Launch",
  description:
    "Private interactive final launch preview with iPhone and iPad mock demos.",
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
