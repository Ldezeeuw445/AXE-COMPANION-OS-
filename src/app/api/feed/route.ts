import { listAxeFeedItems } from "@/services/axeFeedService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listAxeFeedItems(50);
  return Response.json({ items });
}
