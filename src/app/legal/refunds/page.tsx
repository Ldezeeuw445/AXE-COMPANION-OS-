import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refunds · AXE Companion",
};

export default function RefundsPage() {
  return (
    <>
      <h1>Refunds & billing (draft)</h1>
      <p>
        Paid subscriptions for AXE Companion / Trading OS products will be governed by the checkout terms shown at
        purchase. Until Stripe billing is live, no subscription charges are taken through this app.
      </p>
      <p>
        Where mandatory consumer laws provide a cooling-off or refund right, those rights apply in addition to any
        commercial policy we publish at launch.
      </p>
      <p>
        Billing questions:{" "}
        <a href="mailto:support@tradingosapp.com" className="text-tos-warm hover:underline">
          support@tradingosapp.com
        </a>
      </p>
    </>
  );
}
