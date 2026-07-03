import { META_API_COMPLIANCE_FIELDS } from "@/lib/legal/constants";

function checkboxOn(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "on" || v === "true";
}

/** Server-side validation for the three MetaAPI compliance checkboxes. */
export function metaApiComplianceConfirmed(formData: FormData): boolean {
  const { terms, softwareTool, orderForward } = META_API_COMPLIANCE_FIELDS;
  return (
    checkboxOn(formData, terms) &&
    checkboxOn(formData, softwareTool) &&
    checkboxOn(formData, orderForward)
  );
}

export const META_API_COMPLIANCE_ERROR =
  "Confirm all three acknowledgements: Terms & Privacy, software-tool responsibility, and MetaAPI order forwarding.";
