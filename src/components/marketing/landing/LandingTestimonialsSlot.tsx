import {
  LANDING_TESTIMONIALS,
  landingTestimonialsEnabled,
} from "@/lib/marketing/landingCopy";

/**
 * Real, reviewed quotes only. Hidden unless NEXT_PUBLIC_LANDING_TESTIMONIALS=1
 * and the list is non-empty — never invent names or ratings.
 */
export function LandingTestimonialsSlot() {
  if (!landingTestimonialsEnabled() || LANDING_TESTIMONIALS.length === 0) {
    return <div hidden data-landing-testimonials="off" />;
  }

  return (
    <section className="relative z-10 border-t border-white/[0.04] px-5 py-14" data-landing-testimonials="on">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Product feedback
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold text-white">From traders using the product</h2>
        <ul className="mt-8 space-y-4">
          {LANDING_TESTIMONIALS.map((item) => (
            <li key={item.name} className="axe-landing-card-glow p-5">
              <p className="text-sm leading-relaxed text-white/80">“{item.quote}”</p>
              <p className="mt-3 text-xs text-white/45">
                {item.name} · {item.role}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
