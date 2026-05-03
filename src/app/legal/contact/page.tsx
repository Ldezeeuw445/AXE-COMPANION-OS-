import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact · AXE Companion",
};

export default function ContactPage() {
  return (
    <>
      <h1>Contact</h1>
      <p>
        <strong className="text-tos-text">Trading OS</strong>
        <br />
        KvK 74239422 · VAT NL002314900B21
      </p>
      <p>
        Email:{" "}
        <a href="mailto:support@tradingosapp.com" className="text-tos-warm hover:underline">
          support@tradingosapp.com
        </a>
      </p>
      <p className="text-tos-dim">
        Business address: provided on written request (placeholder — replace with published registered address).
      </p>
    </>
  );
}
