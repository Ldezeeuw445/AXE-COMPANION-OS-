import { LEGAL } from "@/lib/legal/constants";

export function CookiesPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Cookie policy</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>This Cookie Policy explains how AXE Companion and Trading OS use cookies and similar technologies.</p>

      <h2>What cookies are</h2>
      <p>
        Cookies are small files stored on your device. Similar technologies include local storage, session storage,
        pixels, SDKs and device identifiers.
      </p>

      <h2>Types of cookies we may use</h2>
      <p>
        <strong>Necessary cookies</strong> — Required for login, authentication, security, routing, session management
        and core app functionality.
      </p>
      <p>
        <strong>Preference cookies</strong> — Used to remember settings such as theme, language, selected workspace,
        active account or UI preferences.
      </p>
      <p>
        <strong>Analytics cookies</strong> — Used to understand how users interact with the product, improve performance
        and fix problems. These are used only where enabled and lawful.
      </p>
      <p>
        <strong>Marketing cookies</strong> — Used for campaigns, attribution or remarketing if enabled. These should be
        opt-in where required.
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can manage cookies through your browser settings and any cookie banner/preferences tool we provide.
        Blocking necessary cookies may break login or app functionality.
      </p>

      <h2>Third-party cookies</h2>
      <p>
        Third-party providers such as Stripe, analytics providers or embedded content may use their own cookies under
        their own policies.
      </p>
    </>
  );
}
