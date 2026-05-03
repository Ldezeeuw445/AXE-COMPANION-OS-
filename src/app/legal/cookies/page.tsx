import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy · AXE Companion",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie policy (draft)</h1>
      <p>
        AXE Companion and related sites may use cookies and similar technologies for authentication, security,
        preferences, and (where enabled) analytics. Essential cookies are required for sign-in and session integrity.
      </p>
      <h2>Managing cookies</h2>
      <p>You can control cookies through your browser settings. Blocking essential cookies may prevent the app from working.</p>
      <h2>Updates</h2>
      <p>We may update this policy when our practices change. Material changes will be communicated as required by law.</p>
    </>
  );
}
