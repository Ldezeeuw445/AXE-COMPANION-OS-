"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function newLinkToken(): string {
  return `axe_${randomBytes(16).toString("hex")}`;
}

export type CreateBrokerResult = { error?: string; linkToken?: string };

export async function createBrokerAccountAction(
  _prev: CreateBrokerResult | undefined,
  formData: FormData,
): Promise<CreateBrokerResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const label = String(formData.get("label") ?? "").trim() || "MT5 Account";
  const mt5Login = String(formData.get("mt5Login") ?? "").trim() || null;
  const mt5Server = String(formData.get("mt5Server") ?? "").trim() || null;

  const linkToken = newLinkToken();
  const linkTokenHash = sha256Hex(linkToken);

  const { error } = await supabase.from("user_broker_accounts").insert({
    user_id: user.id,
    provider: "mt5",
    label,
    status: "active",
    mt5_login: mt5Login,
    mt5_server: mt5Server,
    link_token_hash: linkTokenHash,
  });

  if (error) return { error: error.message };

  revalidatePath("/accounts");
  return { linkToken };
}

export async function setActiveAccountAction(accountId: string | null): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (accountId) {
    const { data: row, error: findErr } = await supabase
      .from("user_broker_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (findErr) return { error: findErr.message };
    if (!row) return { error: "Account not found." };
  }

  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      active_account_id: accountId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/accounts");
  return {};
}
