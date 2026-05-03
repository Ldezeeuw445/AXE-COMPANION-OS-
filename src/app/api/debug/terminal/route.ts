import { NextResponse } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { isMockDataSource } from "@/lib/env";

export async function GET() {
  const usingMock = isMockDataSource();

  if (usingMock) {
    return NextResponse.json({
      status: "MOCK MODE — DATA_SOURCE is not set to 'supabase'",
      fix: "Set NEXT_PUBLIC_DATA_SOURCE=supabase in Replit Secrets",
    });
  }

  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({
      status: "NOT AUTHENTICATED — Supabase is configured but no user session",
      fix: "Make sure you are logged in with the same account as TradingOS",
    });
  }

  const { supabase, user } = authed;

  const [alerts, watchRequests, execRequests, memory] = await Promise.all([
    supabase.from("alerts").select("*").eq("user_id", user.id).limit(3),
    supabase.from("watch_requests").select("*").eq("user_id", user.id).limit(3),
    supabase.from("execution_requests").select("*").eq("user_id", user.id).limit(3),
    supabase.from("assistant_memory_entries").select("id,scope,entry_key").eq("user_id", user.id).limit(10),
  ]);

  return NextResponse.json({
    status: "CONNECTED",
    userId: user.id,
    email: user.email,
    tables: {
      alerts: { count: alerts.data?.length ?? 0, error: alerts.error?.message, sample: alerts.data },
      watch_requests: { count: watchRequests.data?.length ?? 0, error: watchRequests.error?.message, sample: watchRequests.data },
      execution_requests: { count: execRequests.data?.length ?? 0, error: execRequests.error?.message, sample: execRequests.data },
      assistant_memory_entries: { count: memory.data?.length ?? 0, error: memory.error?.message, sample: memory.data },
    },
  });
}
