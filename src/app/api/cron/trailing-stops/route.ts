import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { sweepTrailingStops } from "@/services/trailingStopWatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Host cron — trek trailing stops mee met de prijs.
 *
 * Beveiligd met CRON_SECRET, net als de andere sweeps. Anders dan
 * `/api/cron/paper-stops` heeft deze de MetaApi-token wél nodig: hier gaan
 * echte stops van echte posities naar de broker.
 *
 * Draait via pg_cron (`axe-companion-trailing-stops`), niet via de crontab
 * op de VPS. Eén planner per job — zie scripts/vps.crontab.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  const summary = await sweepTrailingStops(supabase, { maxRows: 200 });

  // Fouten worden gemeld, niet gegooid: één onbereikbare rekening mag de
  // stops van alle andere traders niet tegenhouden.
  return Response.json({ ok: true, ...summary });
}
