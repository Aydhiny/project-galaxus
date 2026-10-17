// Browser-only: turn a recording (video or audio file) into 16 kHz mono
// samples, then send ~100 s WAV chunks to /api/youtube/transcribe. The video
// itself never leaves the PC — only speech audio, chunk by chunk, because
// Vercel caps a request at 4.5 MB.

import { encodeWav, type Segment, type Span } from "@/lib/youtube-longform";

export const RATE = 16_000;
/** Above this, decoding the whole file in a tab tends to run out of memory. */
const MAX_DECODE_BYTES = 1.8 * 1024 ** 3;

export const EXTRACT_HINT = 'ffmpeg -i recording.mp4 -vn -ac 1 -ar 16000 -c:a libopus -b:a 32k recording-audio.ogg';

export async function decodeToMono16k(file: File): Promise<{ samples: Float32Array; duration: number }> {
  if (file.size > MAX_DECODE_BYTES) {
    throw new Error(`This file is ${(file.size / 1024 ** 3).toFixed(1)} GB — too big to open in a browser tab. Extract the audio first (one command, takes seconds): ${EXTRACT_HINT} — then drop the .ogg here; the cut still applies to your original video.`);
  }
  let decoded: AudioBuffer;
  try {
    const bytes = await file.arrayBuffer();
    decoded = await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(bytes);
  } catch {
    throw new Error(`Your browser can't read the audio in this file (common with .mkv). Extract it first: ${EXTRACT_HINT} — then drop the .ogg here.`);
  }
  // Resample + downmix in one render pass.
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return { samples: out.getChannelData(0), duration: decoded.duration };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One chunk → timed lines on the recording's clock. Waits out Groq's rate limit once before giving up. */
export async function transcribeChunk(samples: Float32Array, chunk: Span, vocabulary: string, signal?: AbortSignal): Promise<Segment[]> {
  const piece = samples.subarray(Math.floor(chunk.start * RATE), Math.ceil(chunk.end * RATE));
  const wav = encodeWav(piece, RATE);
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.set("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "chunk.wav");
    form.set("offset", String(chunk.start));
    form.set("prompt", vocabulary);
    const res = await fetch("/api/youtube/transcribe", { method: "POST", body: form, signal });
    const j = (await res.json().catch(() => ({}))) as { segments?: Segment[]; error?: string };
    if (res.ok) return j.segments ?? [];
    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.status === 429 && attempt < 2 && retryAfter > 0 && retryAfter <= 90) { await wait(retryAfter * 1000); continue; }
    if (res.status >= 500 && attempt < 2) { await wait(3000 * (attempt + 1)); continue; }
    throw new Error(j.error ?? `Transcription failed (HTTP ${res.status}).`);
  }
  throw new Error("Transcription kept failing — press Continue to retry.");
}

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
