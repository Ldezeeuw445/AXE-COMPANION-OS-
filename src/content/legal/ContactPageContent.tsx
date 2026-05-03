import { LEGAL } from "@/lib/legal/constants";

export function ContactPageContent() {
  const L = LEGAL;
  return (
    <>
      <h1>Contact</h1>
      <p>
        <strong>For support:</strong>{" "}
        <a href={`mailto:${L.supportEmail}`} className="text-tos-warm hover:underline">
          {L.supportEmail}
        </a>
      </p>
      <p>
        <strong>For privacy requests:</strong>{" "}
        <a href={`mailto:${L.privacyEmail}`} className="text-tos-warm hover:underline">
          {L.privacyEmail}
        </a>
      </p>
      <p>
        <strong>For legal notices:</strong>{" "}
        <a href={`mailto:${L.contactEmail}`} className="text-tos-warm hover:underline">
          {L.contactEmail}
        </a>
      </p>

      <h2>Company</h2>
      <p>
        <strong>{L.companyLegalName}</strong>
        <br />
        KvK: {L.kvk}
        <br />
        VAT: {L.vat}
        <br />
        Address: {L.businessAddress}
      </p>
    </>
  );
}
