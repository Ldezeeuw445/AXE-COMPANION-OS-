import { listAxeFeed } from "@/services/axeFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { items, sharedNews } = await listAxeFeed(80);
  return Response.json({ items, historyDays: 7, sharedNews });
}
