import Image from "next/image";
import {
  LANDING_INTRO,
  LANDING_SHOWCASE,
  LANDING_SHOWCASE_BAND,
} from "@/lib/marketing/landingCopy";

export function LandingShowcase() {
  return (
    <section id="showcase" className="relative">
      <div className="axe-launch-band">
        <p className="axe-launch-eyebrow">{LANDING_INTRO.kicker}</p>
        <h2 className="axe-launch-band-title">
          {LANDING_INTRO.titleLead}{" "}
          <span className="axe-launch-gradient">{LANDING_INTRO.titleAccent}</span>
        </h2>
        <p className="axe-launch-band-copy">{LANDING_INTRO.body}</p>
      </div>

      <div className="axe-launch-intro-stage mx-auto">
        <div className="axe-launch-intro-card axe-launch-intro-bg">
          <Image
            src="/landing/photos/axe_login.jpg"
            alt="AXE login — private command channel"
            width={1206}
            height={2488}
            className="h-full w-full object-cover object-top"
            sizes="(max-width: 900px) 92vw, 66vw"
          />
        </div>
        <div className="axe-launch-intro-card axe-launch-intro-fg">
          <Image
            src="/landing/photos/axe_splash.jpg"
            alt="AXE splash — secure, intelligent, encrypted"
            width={1206}
            height={2190}
            className="h-full w-full object-cover object-top"
            sizes="(max-width: 900px) 92vw, 44vw"
          />
        </div>
      </div>
      <div className="axe-launch-intro-labels mx-auto">
        <div>
          <h3>{LANDING_INTRO.loginTitle}</h3>
          <p>{LANDING_INTRO.loginBody}</p>
        </div>
        <div>
          <h3>{LANDING_INTRO.splashTitle}</h3>
          <p>{LANDING_INTRO.splashBody}</p>
        </div>
      </div>

      <div className="axe-launch-band">
        <p className="axe-launch-eyebrow">{LANDING_SHOWCASE_BAND.kicker}</p>
        <h2 className="axe-launch-band-title">
          {LANDING_SHOWCASE_BAND.titleLead}{" "}
          <span className="axe-launch-gradient">{LANDING_SHOWCASE_BAND.titleAccent}</span>
        </h2>
        <p className="axe-launch-band-copy">{LANDING_SHOWCASE_BAND.body}</p>
      </div>

      <div className="axe-launch-showcase mx-auto">
        {LANDING_SHOWCASE.map((row) => (
          <article
            key={row.step}
            className={`axe-launch-show-section ${row.flip ? "axe-launch-show-section--flip" : ""}`}
          >
            <div className="axe-launch-show-meta">
              <p className="axe-launch-show-step">{row.step}</p>
              <h3>{row.title}</h3>
              <p>{row.body}</p>
              <a className="axe-launch-show-arrow" href={row.href}>
                {row.cta} →
              </a>
            </div>
            <div className="axe-launch-show-photo">
              <Image
                src={row.image}
                alt={row.alt}
                width={1080}
                height={1080}
                className="h-auto w-full"
                sizes="(max-width: 900px) 92vw, 560px"
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
