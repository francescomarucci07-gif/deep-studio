import { NextResponse, type NextRequest } from "next/server";
import { plainText } from "@/lib/coach/text";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_VOICE, isVoice } from "@/lib/voices";

// La voce del coach: il testo va a ElevenLabs dal server, così la chiave non arriva mai al browser.
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CHARS = 1500; // ElevenLabs si paga a caratteri: le risposte del coach stanno molto sotto

export async function POST(request: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "Voce ElevenLabs non configurata." }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Rientra da /accedi." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; voice?: string };
  const text = plainText(body.text ?? "").slice(0, MAX_CHARS);
  if (!text) return NextResponse.json({ error: "Niente da leggere." }, { status: 400 });
  const voice = isVoice(body.voice) ? body.voice : process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5" }),
    },
  );
  if (!res.ok || !res.body) {
    console.error("voce", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return NextResponse.json({ error: "ElevenLabs non risponde." }, { status: 502 });
  }
  console.log("voce", { user: user.id, voice, chars: text.length }); // costo: si paga a caratteri

  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
