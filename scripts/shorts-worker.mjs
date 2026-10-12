#!/usr/bin/env node
// Shorts worker — runs on YOUR PC (the one with the game footage and the video
// pipeline). It asks Galaxus for new voice recordings, then hands each one to
// Claude Code inside the pipeline folder, which edits it into Shorts following
// BRIEF.md. Results (titles, durations, thumbnails) go back to Galaxus; the
// videos themselves stay on this PC.
//
//   node scripts/shorts-worker.mjs --token glx_…   (first run — saved for next time)
//   node scripts/shorts-worker.mjs                 (afterwards)
//
// Options: --dir C:/tmp/hm2_short  --url https://project-galaxus.vercel.app  --once
//
// Rendering is heavy. The Claude process (and everything it starts: python,
// ffmpeg) runs at BELOW-NORMAL priority so your PC stays usable, and only one
// job runs at a time. Plug your laptop in for long edits.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
const CONFIG = path.join(homedir(), ".galaxus-shorts.json");
const saved = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, "utf8")) : {};
const cfg = {
  token: args.token ?? saved.token,
  url: (args.url ?? saved.url ?? "https://project-galaxus.vercel.app").replace(/\/$/, ""),
  dir: (args.dir ?? saved.dir ?? "C:/tmp/hm2_short").replace(/\\/g, "/"),
};
if (!cfg.token) { console.error("Missing --token. Create one on Galaxus → Game dev → Shorts studio → Connect your PC."); process.exit(1); }
if (!existsSync(path.join(cfg.dir, "BRIEF.md"))) { console.error(`No BRIEF.md in ${cfg.dir} — point --dir at your video pipeline folder.`); process.exit(1); }
writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));

const FFMPEG_DIRS = ["C:/Users/ajdin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/"];
const ffmpeg = [...FFMPEG_DIRS.map((d) => d + "ffmpeg.exe"), "ffmpeg"].find((p) => p === "ffmpeg" || existsSync(p));
const api = (p, init = {}) => fetch(cfg.url + p, { ...init, headers: { Authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) } });
const log = (...m) => console.log(new Date().toLocaleTimeString(), ...m);

function prompt(job, jobDir) {
  const rel = path.relative(cfg.dir, jobDir).replace(/\\/g, "/");
  const n = job.count > 0 ? `exactly ${job.count}` : "as many as the content genuinely supports (1 per distinct topic, at most 3)";
  return `You are producing short-form devlog videos for the creator's game from a NEW voice recording, as an unattended job.

Job folder: ${rel}/  — contains the voice recording (voice.*) and job.json (the creator's notes).
Creator's notes: ${job.notes ? JSON.stringify(job.notes) : "(none)"}

1. Read BRIEF.md in this folder and follow it exactly: style, engine, process, assets, footage, environment notes.
2. Transcribe ${rel}/voice.* with the existing transcribe script (edit/transcribe.py) into ${rel}/transcript.json.
3. Decide how many Shorts to make: ${n}. Each 45–65 s, its own hook and topic.
4. For each Short, work in ${rel}/s<n>/ — copy the engine and scripts from the newest edit_v* folder and adapt them. Use game footage from proxy/ (make new proxies only if needed, named g${job.id}_*.mp4).
5. Write each final video to out/galaxus_${job.id}_<n>.mp4.
6. Finally write ${rel}/result.json exactly like:
   {"shorts":[{"title":"<YouTube title>","file":"out/galaxus_${job.id}_1.mp4","seconds":58.4,"hook":"<first line>"}]}
Constraints: keep CPU moderate (ffmpeg -threads 6; at most 2 render chunks in parallel). Never modify other jobs' folders, earlier edit_v* folders, or anything under C:/Games (read-only). Don't ask questions — make sensible decisions and finish.`;
}

function runClaude(text, cwd, logFile) {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--permission-mode", "bypassPermissions", "--add-dir", "C:/Games", "--output-format", "text"], { cwd, shell: true, windowsHide: true });
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not fatal */ }
    let out = "";
    const keep = (d) => { out = (out + d.toString()).slice(-200_000); writeFileSync(logFile, out); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => { keep("\n[worker] timed out after 3 h\n"); child.kill(); }, 3 * 3600_000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.stdin.end(text);
  });
}

function thumb(file) {
  try {
    const tmp = path.join(os.tmpdir(), `galaxus-thumb-${Date.now()}.jpg`);
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", "3", "-i", file, "-frames:v", "1", "-vf", "scale=270:-2", "-q:v", "5", tmp]);
    return `data:image/jpeg;base64,${readFileSync(tmp).toString("base64")}`;
  } catch { return null; }
}

function seconds(file) {
  try {
    const probe = ffmpeg.replace(/ffmpeg(\.exe)?$/, (m) => m.replace("ffmpeg", "ffprobe"));
    return Number(execFileSync(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).toString().trim()) || null;
  } catch { return null; }
}

async function handle(job) {
  const jobDir = path.join(cfg.dir, "galaxus", String(job.id));
  mkdirSync(jobDir, { recursive: true });
  log(`Job #${job.id}: downloading ${job.audioName ?? "recording"}…`);
  const res = await api(`/api/shorts/${job.id}/audio`);
  if (!res.ok) throw new Error(`audio download ${res.status}`);
  const ext = (job.audioName?.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? ".mp3").toLowerCase();
  writeFileSync(path.join(jobDir, `voice${ext}`), Buffer.from(await res.arrayBuffer()));
  writeFileSync(path.join(jobDir, "job.json"), JSON.stringify(job, null, 2));

  log(`Job #${job.id}: Claude is editing (low priority — this can take a while)…`);
  const { code, out } = await runClaude(prompt(job, jobDir), cfg.dir, path.join(jobDir, "worker.log"));

  const manifest = path.join(jobDir, "result.json");
  let shorts = [];
  if (existsSync(manifest)) {
    try { shorts = JSON.parse(readFileSync(manifest, "utf8")).shorts ?? []; } catch { /* broken manifest */ }
  }
  // Fallback: any finished file for this job in out/
  if (!shorts.length && existsSync(path.join(cfg.dir, "out"))) {
    shorts = readdirSync(path.join(cfg.dir, "out")).filter((f) => f.startsWith(`galaxus_${job.id}_`) && f.endsWith(".mp4")).map((f) => ({ title: f, file: `out/${f}` }));
  }
  const results = shorts.map((s) => {
    const abs = path.isAbsolute(s.file) ? s.file : path.join(cfg.dir, s.file);
    return { title: s.title, file: abs.replace(/\\/g, "/"), seconds: s.seconds ?? seconds(abs), hook: s.hook ?? null, thumb: existsSync(abs) ? thumb(abs) : null };
  }).filter((r) => existsSync(r.file));

  await api(`/api/shorts/${job.id}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: code === 0 && results.length > 0, results, log: out.slice(-4000) }),
  });
  log(`Job #${job.id}: ${results.length ? `done — ${results.length} Short${results.length === 1 ? "" : "s"}` : "failed (see Galaxus for the log)"}`);
}

async function loop() {
  log(`Shorts worker online · ${cfg.url} · pipeline ${cfg.dir}`);
  for (;;) {
    try {
      const r = await api("/api/shorts/claim", { method: "POST" });
      if (r.status === 401) { console.error("Token rejected — create a new one on the Game dev page."); process.exit(1); }
      const { job } = await r.json();
      if (job) await handle(job).catch(async (e) => {
        log(`Job #${job.id} crashed:`, e.message);
        await api(`/api/shorts/${job.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, log: String(e.stack ?? e) }) }).catch(() => {});
      });
      else if (args.once) return;
    } catch (e) { log("Galaxus unreachable, retrying:", e.message); }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}
loop();
