import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchWalletBalance } from "@/lib/wallets/balanceService";
import {
  isValidWalletAddress,
  normalizeWalletAddress,
  WALLET_PROVIDERS_LIST,
} from "@/lib/wallets/walletCatalog";
import type { CryptoWalletWithBalance, WalletChain, WalletProvider } from "@/types/wallets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAINS: WalletChain[] = ["ethereum", "arbitrum", "polygon", "bitcoin"];

function isProvider(v: string): v is WalletProvider {
  return (WALLET_PROVIDERS_LIST as string[]).includes(v);
}

function isChain(v: string): v is WalletChain {
  return (CHAINS as string[]).includes(v);
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const refresh = new URL(req.url).searchParams.get("refresh") === "true";

  const { data, error } = await supabase
    .from("user_crypto_wallets")
    .select("id, provider, label, chain, address, notes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  let wallets: CryptoWalletWithBalance[] = rows.map((row) => ({
    ...(row as CryptoWalletWithBalance),
    balance: null,
  }));

  if (refresh && wallets.length > 0) {
    wallets = await Promise.all(
      wallets.map(async (w) => ({
        ...w,
        balance: await fetchWalletBalance(w.chain, w.address),
      })),
    );
  }

  const totalUsd = wallets.reduce((sum, w) => sum + (w.balance?.usdEstimate ?? 0), 0);

  return Response.json({ wallets, totalUsd: totalUsd > 0 ? totalUsd : null });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    provider?: string;
    chain?: string;
    address?: string;
    label?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const provider = body.provider?.trim() ?? "";
  const chain = body.chain?.trim() ?? "";
  const address = body.address?.trim() ?? "";

  if (!isProvider(provider)) {
    return Response.json({ error: "invalid_provider" }, { status: 400 });
  }
  if (!isChain(chain)) {
    return Response.json({ error: "invalid_chain" }, { status: 400 });
  }
  if (!isValidWalletAddress(chain, address)) {
    return Response.json({ error: "invalid_address" }, { status: 400 });
  }

  const normalized = normalizeWalletAddress(chain, address);

  const { data, error } = await supabase
    .from("user_crypto_wallets")
    .insert({
      user_id: user.id,
      provider,
      chain,
      address: normalized,
      label: (body.label ?? "").trim().slice(0, 80),
      notes: (body.notes ?? "").trim().slice(0, 280) || null,
    })
    .select("id, provider, label, chain, address, notes, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "address_already_tracked" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const balance = await fetchWalletBalance(chain, normalized);

  return Response.json({
    wallet: { ...(data as CryptoWalletWithBalance), balance },
  });
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase
    .from("user_crypto_wallets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
