import { Compass } from "lucide-react";
import { LANDING_FAQ } from "@/lib/marketing/landingCopy";

export function LandingFaq() {
  return (
    <section id="faq" className="relative z-10 scroll-mt-24 border-t border-white/[0.04] px-5 py-14 md:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Compass className="h-5 w-5 text-cyan-300/85" aria-hidden />
          <h2 className="text-center text-2xl font-bold text-white md:text-3xl">FAQ</h2>
        </div>
        <div className="space-y-2">
          {LANDING_FAQ.map((item) => (
            <details key={item.q} className="axe-landing-card-glow group px-5 py-1 open:bg-white/[0.04]">
              <summary className="cursor-pointer list-none py-3 text-sm font-medium text-white/90 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:text-cyan-300/95">{item.q}</span>
              </summary>
              <p className="border-t border-white/[0.06] pb-3 pt-2 text-sm leading-relaxed text-tos-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
