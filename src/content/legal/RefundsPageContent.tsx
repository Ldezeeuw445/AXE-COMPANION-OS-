import { LEGAL } from "@/lib/legal/constants";

export function RefundsPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Refund and cancellation policy</h1>
      <p>
        <strong>Effective date:</strong> {L.effectiveDate}
      </p>
      <p>This policy explains cancellations, renewals and refunds for Trading OS subscriptions.</p>

      <h2>Subscriptions</h2>
      <p>Paid subscriptions renew automatically unless cancelled before the next billing date.</p>
      <p>The Pro plan may be offered at €19/month unless changed.</p>
      <p>Prices may exclude VAT or other taxes.</p>

      <h2>Cancellation</h2>
      <p>
        You can cancel through the billing portal, account settings or by contacting{" "}
        <a href={`mailto:${L.supportEmail}`} className="text-tos-warm hover:underline">
          {L.supportEmail}
        </a>{" "}
        if no automated portal is available.
      </p>
      <p>Cancellation normally stops renewal at the end of the current billing period.</p>

      <h2>Refunds</h2>
      <p>
        Unless required by law, we generally do not provide refunds for partial billing periods, unused time, unused AI
        queries or failure to use the service.
      </p>
      <p>We may consider refunds for:</p>
      <ul>
        <li>duplicate charges</li>
        <li>clear billing errors</li>
        <li>technical inability to access paid features for a prolonged period caused by us</li>
      </ul>

      <h2>EU consumer withdrawal rights</h2>
      <p>
        If you are an EU consumer, you may have a 14-day right of withdrawal for online purchases. For digital services
        or digital content, this right may be affected if you request immediate access to the service and acknowledge
        that the service starts before the withdrawal period ends.
      </p>
      <p>The checkout flow should clearly explain any waiver/acknowledgement required by law.</p>

      <h2>How to request cancellation or refund</h2>
      <p>
        Contact:{" "}
        <a href={`mailto:${L.supportEmail}`} className="text-tos-warm hover:underline">
          {L.supportEmail}
        </a>
      </p>
      <p>Include: account email; subscription ID if available; reason; date of charge.</p>
    </>
  );
}
