import { resolveSquawkStreamUrl } from "@/lib/squawk/resolveStream";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Missing station id" }, { status: 400 });
  }

  try {
    const url = await resolveSquawkStreamUrl(id);
    if (!url) {
      return Response.json({ error: "Stream unavailable" }, { status: 404 });
    }
    return Response.json({ url });
  } catch {
    return Response.json({ error: "Resolve failed" }, { status: 500 });
  }
}
