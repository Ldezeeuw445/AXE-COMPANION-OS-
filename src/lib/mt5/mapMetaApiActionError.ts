import "server-only";

import {
  classifyMetaApiProvisioningError,
  userMessageForCode,
  type Mt5CloudErrorCode,
} from "@/lib/mt5/metaApiErrors";
import { MetaApiRequestError } from "@/lib/mt5/metaApiClient";
import { Mt5ActionTimeoutError } from "@/lib/mt5/mt5ActionBudget";

export type Mt5ActionError = { ok: false; code: Mt5CloudErrorCode; message: string };

export function mapMetaApiActionError(e: unknown): Mt5ActionError {
  if (e instanceof Mt5ActionTimeoutError) {
    return { ok: false, code: "metaapi_timeout", message: userMessageForCode("metaapi_timeout") };
  }
  if (e instanceof MetaApiRequestError) {
    const code = e.code;
    if (code === "unknown" && e.payload) {
      const alt = classifyMetaApiProvisioningError(e.payload);
      if (alt !== "unknown") {
        return { ok: false, code: alt, message: userMessageForCode(alt) };
      }
    }
    return { ok: false, code, message: userMessageForCode(code) };
  }
  if (e instanceof Error && e.name === "AbortError") {
    return { ok: false, code: "metaapi_timeout", message: userMessageForCode("metaapi_timeout") };
  }
  return { ok: false, code: "unknown", message: userMessageForCode("unknown") };
}
