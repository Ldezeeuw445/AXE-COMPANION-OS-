import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ELEVENLABS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel — deep British male
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

// ElevenLabs bills per character — cap each request so one call can't drain credits.
const MAX_TTS_CHARS = 2_000;

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 501 });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { text?: string }
    | null;

  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TTS_CHARS) : "";
  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const voiceId = ELEVENLABS_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.65,        // higher = more consistent on numbers/prices
            similarity_boost: 0.80,  // stronger voice identity
            style: 0.15,            // slightly expressive, not monotone
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown error");
      console.error("[TTS] ElevenLabs error:", res.status, err);
      return NextResponse.json({ error: "TTS request failed" }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[TTS] Fetch error:", err);
    return NextResponse.json({ error: "TTS unavailable" }, { status: 503 });
  }
}
