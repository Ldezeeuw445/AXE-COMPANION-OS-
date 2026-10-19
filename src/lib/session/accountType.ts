import { buildAccountProfile, type AccountKind, type AccountProfileInput } from "@/lib/risk/accountProfile";
import type { AccountType } from "@/lib/session/activeSession";

export function accountTypeFromKind(kind: AccountKind): AccountType {
  switch (kind) {
    case "live":
      return "live";
    case "demo":
      return "demo";
    case "prop_evaluation":
      return "prop";
    case "prop_funded":
      return "funded";
    default:
      return "unknown";
  }
}

export function accountTypeFromBroker(
  input: AccountProfileInput & { connectionMethod?: string | null },
): AccountType {
  if (input.connectionMethod === "demo_paper" || input.connectionMethod === "demo") {
    return "demo";
  }
  return accountTypeFromKind(buildAccountProfile(input).kind);
}
