import type { NextRequest } from "next/server";
import { handleChartPublish } from "@/lib/chart/publishIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The address the MetaApi streamer actually posts to. */
export async function POST(req: NextRequest) {
  return handleChartPublish(req);
}
