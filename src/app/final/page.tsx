import { permanentRedirect } from "next/navigation";

/**
 * Retired draft landing page.
 *
 * Four landing pages were publicly reachable at once (/, /launch, /final,
 * /finallaunch, /ui-premium) and robots.ts admitted in a comment that "which
 * landing page wins is a product decision". It is decided: `/` is the landing
 * page. These paths 308 to it so any bookmark or stale search result still
 * arrives somewhere real instead of a second, slightly different pitch.
 */
export default function RetiredDraftLanding(): never {
  permanentRedirect("/");
}
