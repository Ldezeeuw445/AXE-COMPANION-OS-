import type { NextRequest } from "next/server";
import { handleChartPublish } from "@/lib/chart/publishIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same ingest under this app's own /api prefix. */
export async function POST(req: NextRequest) {
  return handleChartPublish(req);
}
