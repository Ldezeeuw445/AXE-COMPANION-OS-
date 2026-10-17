import { firstNonEmptyEnv } from "@/lib/envFallback";
import OpenAI from "openai";

/**
 * Optional STT for voice notes. There is no dedicated Companion STT route
 * today — chat uses browser SpeechRecognition. If an OpenAI key is present
 * we use Whisper; otherwise the caller stores the audio only.
 */
export async function transcribeJournalAudio(
  bytes: Buffer,
  mime: string,
  fileName = "voice.webm",
): Promise<{ transcript: string | null; reason: "ok" | "not_configured" | "failed" }> {
  const apiKey = firstNonEmptyEnv("OPENAI_API_KEY", "OPEN_AI_API_KEY");
  if (!apiKey) return { transcript: null, reason: "not_configured" };

  try {
    const client = new OpenAI({ apiKey });
    const file = new File([new Uint8Array(bytes)], fileName, { type: mime || "audio/webm" });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    const text = (result.text ?? "").trim();
    return { transcript: text || null, reason: "ok" };
  } catch {
    return { transcript: null, reason: "failed" };
  }
}
