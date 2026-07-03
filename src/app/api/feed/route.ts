import { listAxeFeedItems } from "@/services/axeFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listAxeFeedItems(80);
  return Response.json({ items, historyDays: 7 });
}
