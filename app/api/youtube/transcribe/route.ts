// One audio chunk (16 kHz mono WAV, ≤ ~100 s, cut by the browser) → timed
// lines from Groq's free Whisper. The browser sends the chunk's start time so
// the lines come back on the recording's clock. Nothing is stored here: the
// page collects every chunk's lines and saves the transcript once.
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth-session";
import { hitRateLimit } from "@/lib/rate-limit-db";
import { groqKeyFor } from "@/lib/services/youtube/brain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps a request at 4.5 MB
const WHISPER_MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  let userId: number;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Sign in first." }, { status: 401 }); }

  // ~36 chunks per hour of recording; this leaves room for a couple of long videos and retries.
  const limit = await hitRateLimit(`yt-transcribe:${userId}`, 300, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many chunks this hour — try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const key = await groqKeyFor(userId);
  if (!key) return NextResponse.json({ error: "Add a free Groq key in YouTube → Setup (it powers Whisper transcription)." }, { status: 400 });

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size < 100) return NextResponse.json({ error: "No audio in this chunk." }, { status: 400 });
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Chunk too large." }, { status: 413 });
    const offset = Math.max(0, Number(form.get("offset") ?? 0) || 0);
    const vocabulary = String(form.get("prompt") ?? "").slice(0, 400);
    const language = String(form.get("language") ?? "").match(/^[a-z]{2}$/)?.[0];

    const body = new FormData();
    body.set("file", audio, "chunk.wav");
    body.set("model", WHISPER_MODEL);
    body.set("response_format", "verbose_json");
    body.set("temperature", "0");
    if (vocabulary) body.set("prompt", vocabulary); // spelling hints: names, tools, the game
    if (language) body.set("language", language);

    // Fixed public host, so a plain fetch (no user-chosen URL to guard).
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body, cache: "no-store", signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      const retryAfter = res.headers.get("retry-after");
      const msg = res.status === 429
        ? "Groq's free Whisper limit is reached for now (about 2 hours of audio per hour) — wait a bit and press Continue."
        : res.status === 401 ? "Groq rejected the key — paste a fresh one in Setup." : `Whisper failed (HTTP ${res.status}): ${text}`;
      return NextResponse.json({ error: msg }, { status: res.status === 429 ? 429 : 502, headers: retryAfter ? { "Retry-After": retryAfter } : undefined });
    }
    const j = (await res.json()) as { segments?: { start: number; end: number; text: string; no_speech_prob?: number }[] };
    const segments = (j.segments ?? [])
      // Whisper "hears" words in silence now and then; drop lines it is sure are not speech.
      .filter((s) => s.text.trim() && (s.no_speech_prob ?? 0) < 0.8)
      .map((s) => ({ start: +(s.start + offset).toFixed(3), end: +(s.end + offset).toFixed(3), text: s.text.trim() }));
    return NextResponse.json({ segments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Transcription failed." }, { status: 500 });
  }
}
