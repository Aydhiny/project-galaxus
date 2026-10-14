// The agent facility as a three.js scene: a dark ops floor, a mission wall, a holo
// table, one pod per team, and a cute low-poly agent at every desk whose monitor
// shows what it is doing right now. Same approach as components/empire/room-engine.ts
// (raw three.js, Lambert materials, no shadow maps), driven by plain data:
//   setState(agents, missions, extras) → add/remove agents, redraw monitors, fire
//     "packets" (work → holo table), radio beams (desk → desk), draw links between
//     agents on linked missions, a red beacon over anyone who needs you, the shift clock
//   focus(id) / setView(v)             → camera glides there
// The camera is yours: drag to look around, right-drag (or Shift+drag) to move
// across the floor, scroll to zoom, WASD / arrow keys to walk (Shift = faster).
// Grabbing the camera cancels any glide; a glide never fights your hand.
// It never fetches anything; the page feeds it.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { logoTexture } from "@/components/empire/logo-texture";
import { PROVIDER_LOGO } from "@/components/ops/provider-logos";
import { PROVIDERS, ROLES, TEAMS, type Presence, type ProviderKey, type RoleKey, type TeamKey } from "@/lib/ops";

export type AgentView = {
  id: number; name: string; role: RoleKey; provider: ProviderKey; presence: Presence; cloud?: boolean;
  activity: string | null; activityKind: string | null; activityUrl: string | null;
};
export type SceneExtras = {
  messages: { id: number; from: number | null; to: number | null; team: string | null }[];
  links: [number, number][]; // agents working on linked missions (delegator, delegate)
  shift: string; shiftOn: boolean;
};
export type MissionView = { id: number; title: string; status: string; budgetCents: number | null; spentCents: number };
export type OpsView = "overview" | "wall" | "table";

const BG = 0x1a1b1e; // a touch under Galaxus' #1e1f22 background, for depth
const SKIN = [0xffd9b8, 0xf1c27d, 0xe0ac69, 0xc68642, 0xffe0bd, 0xd9a066];
const HAIR = [0x2b1b12, 0x5a3825, 0xb5651d, 0x111111, 0x7a4b2a, 0xd8b36a];
const BODY: Record<RoleKey, number> = {
  scout: 0x8a7a55, researcher: 0xeef2f6, builder: 0xf97316, reviewer: 0x3b5bdb,
  scribe: 0x8b5cf6, treasurer: 0x15803d, comms: 0x0d9488, chief: 0x161b26,
};
const KIND_ICON: Record<string, string> = { browse: "🌐", search: "🔎", read: "📄", edit: "✏️", shell: "⌨️", tool: "🔧", think: "💭", status: "●", message: "📻", delegate: "🤝", waiting: "✋" };
const COMMAND_POS = new THREE.Vector3(0, 6.5, -10.4); // where your own radio messages come from: the mission wall

// Where each team sits (x, z) and how its desks wrap (2 per row).
const PODS: Record<TeamKey, { x: number; z: number }> = {
  research: { x: -9.5, z: -6.2 }, command: { x: 0, z: -7.6 }, build: { x: 9.5, z: -6.2 },
  docs: { x: -9.5, z: 3 }, treasury: { x: 9.5, z: 3 }, outreach: { x: 0, z: 6.2 },
};
const COL = 3.1, ROW = 3.6;

const VIEWS: Record<OpsView, { cam: [number, number, number]; look: [number, number, number] }> = {
  overview: { cam: [0, 17.5, 19.5], look: [0, 0.2, -1.2] },
  wall: { cam: [0, 6, 7], look: [0, 5.4, -11] },
  table: { cam: [0, 6.2, 8.5], look: [0, 1.2, -1.5] },
};

const hash = (n: number) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 13; return x >>> 0; };

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d")! };
}
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, "").slice(0, -1)}…`;
  return lines;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

type Slot = {
  agent: AgentView;
  root: THREE.Group;
  pos: THREE.Vector3;
  head: THREE.Object3D;
  armL: THREE.Object3D; armR: THREE.Object3D;
  eyes: THREE.Object3D[];
  prop: THREE.Object3D | null;
  ring: THREE.Mesh;
  hit: THREE.Mesh;
  beacon: THREE.Group; // red light over the head while the agent waits for you
  rack: THREE.Mesh[] | null; // a cloud agent's server lights
  mon: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; sig: string; mat: THREE.MeshBasicMaterial };
  bubble: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; sprite: THREE.Sprite; sig: string };
  seed: number;
  flash: number;
  nextBlink: number;
};

export class OpsEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 140);
  private raycaster = new THREE.Raycaster();
  private ro: ResizeObserver;
  private raf = 0;
  private running = false;
  private last = 0;
  private start = performance.now();
  private mouse = new THREE.Vector2(0, 0);
  private camGoal = new THREE.Vector3(...VIEWS.overview.cam);
  private lookGoal = new THREE.Vector3(...VIEWS.overview.look);
  private look = new THREE.Vector3(...VIEWS.overview.look);
  private crew = new THREE.Group();
  private slots = new Map<number, Slot>();
  private shared: THREE.Object3D[] = [];
  private hovered: number | null = null;
  private focused: number | null = null;
  private selected: number | null = null;
  private packets: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number }[] = [];
  private lastMsgId: number | null = null;
  private linkSig = "";
  private links = new THREE.Group();
  private linkMats: THREE.LineDashedMaterial[] = [];
  private clock: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; label: string; on: boolean; drawnAt: number } | null = null;
  private table = new THREE.Group();
  private ringsHolo: THREE.Mesh[] = [];
  private board: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; sig: string } | null = null;
  private layoutSig = "";
  private visHandler = () => { if (document.hidden) this.pause(); else this.run(); };
  private controls: OrbitControls;
  private gliding = true; // flying to camGoal/lookGoal (intro, view buttons, agent focus)
  private keys = new Set<string>();
  private downAt = { x: 0, y: 0 };

  constructor(private host: HTMLElement, private opts: { onPick: (id: number | null) => void; lite?: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !opts.lite, powerPreference: opts.lite ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lite ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(BG);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.scene.fog = new THREE.FogExp2(BG, 0.016);
    this.scene.add(this.crew, this.links);
    this.buildRoom();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    host.addEventListener("pointermove", this.onMove);
    host.addEventListener("pointerleave", this.onLeave);
    host.addEventListener("click", this.onClick);
    document.addEventListener("visibilitychange", this.visHandler);
    this.camera.position.set(VIEWS.overview.cam[0], VIEWS.overview.cam[1] + 6, VIEWS.overview.cam[2] + 10);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false; // right-drag slides along the floor, like walking
    this.controls.minDistance = 3;
    this.controls.maxDistance = 48;
    this.controls.maxPolarAngle = Math.PI / 2.08; // never under the floor
    this.controls.zoomSpeed = 1.1;
    this.controls.panSpeed = 1.1;
    this.controls.target.copy(this.look);
    this.controls.addEventListener("start", () => { this.gliding = false; }); // your hand wins
    host.addEventListener("pointerdown", this.onDown);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  setState(agents: AgentView[], missions: MissionView[], extras?: SceneExtras) {
    const sig = agents.map((a) => `${a.id}:${a.role}:${a.provider}:${a.name}:${a.cloud ? 1 : 0}`).join("|");
    if (sig !== this.layoutSig) { this.layoutSig = sig; this.layout(agents); this.linkSig = ""; }
    for (const a of agents) this.updateAgent(this.slots.get(a.id)!, a);
    this.drawBoard(missions);
    if (!extras) return;
    this.radio(extras.messages, agents);
    this.drawLinks(extras.links);
    if (this.clock && (this.clock.label !== extras.shift || this.clock.on !== extras.shiftOn)) { this.clock.label = extras.shift; this.clock.on = extras.shiftOn; this.drawClock(); }
  }

  /** Highlight an agent (ring, speech bubble). Never moves the camera. */
  select(id: number | null) { this.selected = id; }

  setView(v: OpsView) { this.focused = null; this.camGoal.set(...VIEWS[v].cam); this.lookGoal.set(...VIEWS[v].look); this.gliding = true; }

  focus(id: number | null) {
    this.focused = id;
    const s = id != null ? this.slots.get(id) : null;
    if (!s) { this.setView("overview"); return; }
    this.camGoal.set(s.pos.x - 0.3, s.pos.y + 5.4, s.pos.z + 4.6);
    this.lookGoal.set(s.pos.x - 0.1, s.pos.y + 1.3, s.pos.z - 0.6);
    this.gliding = true;
  }

  run() {
    if (this.running) return;
    this.running = true;
    const minGap = this.opts.lite ? 1000 / 30 : 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < minGap) return;
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      this.tick(now / 1000, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  pause() { this.running = false; cancelAnimationFrame(this.raf); }

  dispose() {
    this.pause();
    this.ro.disconnect();
    this.host.removeEventListener("pointermove", this.onMove);
    this.host.removeEventListener("pointerleave", this.onLeave);
    this.host.removeEventListener("click", this.onClick);
    this.host.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.controls.dispose();
    document.removeEventListener("visibilitychange", this.visHandler);
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private pointer(e: PointerEvent | MouseEvent) {
    const r = this.host.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }
  private pick(): number | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.slots.values()].map((s) => s.hit), false);
    return hits[0] ? (hits[0].object.userData.agentId as number) : null;
  }
  private onMove = (e: PointerEvent) => {
    this.pointer(e);
    this.hovered = this.pick();
    this.host.style.cursor = this.hovered != null ? "pointer" : "default";
  };
  private onLeave = () => { this.hovered = null; this.mouse.set(0, 0); this.host.style.cursor = "default"; };
  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onClick = (e: MouseEvent) => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) return; // that was a drag, not a click
    this.pointer(e);
    const id = this.pick();
    if (id != null) this.opts.onPick(id); // clicking empty floor keeps your view where you put it
  };
  private typing() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  private onKey = (e: KeyboardEvent) => {
    if (this.typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "q", "e"].includes(k)) {
      this.keys.add(k); this.gliding = false;
      if (k.startsWith("arrow")) e.preventDefault(); // don't scroll the page
    }
    if (k === "shift") this.keys.add("shift");
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private onBlur = () => { this.keys.clear(); };

  /** WASD / arrows walk the camera and its target together across the floor; Q/E turn. */
  private walk(dt: number) {
    if (!this.keys.size) return;
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0);
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const k = this.keys;
    const move = new THREE.Vector3()
      .addScaledVector(fwd, (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0))
      .addScaledVector(right, (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0));
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar((k.has("shift") ? 22 : 10) * dt);
      this.camera.position.add(move);
      this.controls.target.add(move);
    }
    const turn = (k.has("e") ? 1 : 0) - (k.has("q") ? 1 : 0);
    if (turn) {
      const off = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.4 * dt);
      this.camera.position.copy(this.controls.target).add(off);
    }
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%"; this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 70 : 46; // portrait phones need a wider view
    this.camera.updateProjectionMatrix();
  }

  // ─── Frame ─────────────────────────────────────────────────────────────────

  private tick(t: number, dt: number) {
    if (this.gliding) {
      // Fly to the chosen view; stop as soon as we're there (or you grab the camera).
      const k = 1 - Math.pow(0.0009, dt); // frame-rate independent ease
      this.camera.position.lerp(this.camGoal, k);
      this.controls.target.lerp(this.lookGoal, k);
      if (this.camera.position.distanceTo(this.camGoal) < 0.03 && this.controls.target.distanceTo(this.lookGoal) < 0.03) this.gliding = false;
    }
    this.walk(dt);
    // Keep the camera and what it looks at inside the facility.
    const tg = this.controls.target;
    tg.set(THREE.MathUtils.clamp(tg.x, -17, 17), THREE.MathUtils.clamp(tg.y, 0, 9), THREE.MathUtils.clamp(tg.z, -11, 15));
    const cp = this.camera.position;
    cp.set(THREE.MathUtils.clamp(cp.x, -34, 34), THREE.MathUtils.clamp(cp.y, 0.6, 40), THREE.MathUtils.clamp(cp.z, -10.5, 40));
    this.controls.update();
    this.look.copy(tg);

    // Holo table: slow spin, pulsing rings.
    this.table.rotation.y = t * 0.3;
    this.ringsHolo.forEach((r, i) => { const s = 1 + 0.06 * Math.sin(t * 1.6 + i); r.scale.set(s, s, 1); (r.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 1.6 + i); });

    for (const s of this.slots.values()) this.animateAgent(s, t, dt);

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.t += dt / p.dur;
      if (p.t >= 1) { this.crew.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); this.packets.splice(i, 1); continue; }
      p.mesh.position.lerpVectors(p.from, p.to, p.t);
      p.mesh.position.y += Math.sin(p.t * Math.PI) * p.arc; // arcs up and over
      p.mesh.scale.setScalar(0.8 + 0.6 * Math.sin(p.t * Math.PI));
    }
    for (const m of this.linkMats) m.opacity = 0.55 + 0.4 * Math.sin(t * 4); // the link pulses while data flows
    if (this.clock && performance.now() - this.clock.drawnAt > 20_000) this.drawClock(); // keep the wall clock's minutes current
    this.renderer.render(this.scene, this.camera);
  }

  private animateAgent(s: Slot, t: number, dt: number) {
    const working = s.agent.presence === "working";
    const waiting = s.agent.presence === "waiting";
    const offline = s.agent.presence === "offline";
    const k = s.seed;
    s.root.position.y = s.pos.y + (offline ? -0.02 : Math.sin(t * 1.8 + k) * 0.015);
    s.head.rotation.z = offline ? 0.22 : Math.sin(t * 0.9 + k) * 0.05; // asleep: head tips to the side
    s.head.rotation.x = offline ? 0.12 : working ? Math.sin(t * 2.2 + k) * 0.06 : 0;
    // Typing arms when working.
    const typing = working ? Math.sin(t * 14 + k) * 0.35 : 0;
    s.armL.rotation.x = -1.1 + typing; s.armR.rotation.x = -1.1 - typing;
    // Waiting for you: right hand up, waving; the red beacon spins over the head.
    // (z tilts the arm out to the side so the hand clears the big head; x lifts it.)
    if (waiting) { s.armR.rotation.x = -2.9; s.armR.rotation.z = 0.9 + Math.sin(t * 9) * 0.3; s.head.rotation.x = -0.15; } else s.armR.rotation.z = 0;
    s.beacon.visible = waiting;
    if (waiting) { s.beacon.rotation.y = t * 5; s.beacon.children[0].scale.setScalar(1 + 0.25 * Math.sin(t * 10)); }
    if (s.rack) s.rack.forEach((l, i) => { (l.material as THREE.MeshBasicMaterial).color.setHex(working && Math.sin(t * (6 + i * 3) + i) > 0 ? 0x34d399 : 0x0f3b2c); });
    if (s.prop) s.prop.rotation.y = working ? Math.sin(t * 2 + k) * 0.5 : 0;
    // Blinking.
    if (!offline && t > s.nextBlink) { s.nextBlink = t + 2.5 + (hash(Math.floor(t * 10) + s.agent.id) % 30) / 10; for (const e of s.eyes) e.scale.y = 0.1; }
    for (const e of s.eyes) e.scale.y = offline ? 0.12 : Math.min(1, e.scale.y + dt * 12);
    // Status ring + hover/focus highlight.
    const ringMat = s.ring.material as THREE.MeshBasicMaterial;
    ringMat.color.set(offline ? 0x475569 : waiting ? 0xf43f5e : working ? 0x34d399 : 0xfbbf24);
    const hot = this.hovered === s.agent.id || this.selected === s.agent.id;
    const pulse = working ? 1 + Math.sin(t * 4) * 0.08 : 1;
    s.ring.scale.setScalar((hot ? 1.18 : 1) * pulse);
    // Monitor flash when something new arrives.
    if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt * 1.6); }
    s.mon.mat.color.setScalar(1 + s.flash * 0.9);
    // Speech bubble only while working or hovered.
    const showBubble = working || waiting || hot;
    s.bubble.sprite.material.opacity += ((showBubble ? 1 : 0) - s.bubble.sprite.material.opacity) * Math.min(1, dt * 8);
  }

  // ─── Updating from data ───────────────────────────────────────────────────

  private updateAgent(s: Slot, a: AgentView) {
    const prev = s.agent;
    s.agent = a;
    const sig = `${a.presence}|${a.activity}|${a.activityKind}|${a.activityUrl}`;
    if (sig !== s.mon.sig) {
      const changed = prev.activity !== a.activity && a.activity;
      s.mon.sig = sig;
      this.drawMonitor(s);
      this.drawBubble(s);
      if (changed && a.presence !== "offline") { s.flash = 1; this.firePacket(s); }
    }
  }

  private firePacket(s: Slot) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(`#${PROVIDERS[s.agent.provider].hex}`).lerp(new THREE.Color(0x6b8afd), 0.5) }));
    const from = new THREE.Vector3(s.pos.x - 0.55, s.pos.y + 2.2, s.pos.z - 0.7);
    const to = new THREE.Vector3(0, 2.1, -1.5);
    mesh.position.copy(from);
    this.crew.add(mesh);
    this.packets.push({ mesh, from, to, t: 0, dur: 0.9, arc: 1.4 });
  }

  /** New radio messages fly from the sender's desk (or the command wall, for yours) to each recipient. */
  private radio(messages: SceneExtras["messages"], agents: AgentView[]) {
    const max = messages.reduce((m, x) => Math.max(m, x.id), 0);
    if (this.lastMsgId == null) { this.lastMsgId = max; return; } // don't replay history on load
    const fresh = messages.filter((m) => m.id > this.lastMsgId!).slice(0, 6);
    this.lastMsgId = Math.max(this.lastMsgId, max);
    for (const m of fresh) {
      const from = m.from != null ? this.slots.get(m.from) : null;
      const start = from ? new THREE.Vector3(from.pos.x - 0.55, from.pos.y + 2.6, from.pos.z - 0.7) : COMMAND_POS.clone();
      const targets = m.to != null ? [m.to]
        : agents.filter((a) => a.id !== m.from && (!m.team || ROLES[a.role].team === m.team)).map((a) => a.id);
      for (const id of targets.slice(0, 8)) {
        const s = this.slots.get(id);
        if (!s) continue;
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: from ? 0xa78bfa : 0xe8e8e6 }));
        const to = new THREE.Vector3(s.pos.x - 0.55, s.pos.y + 2.6, s.pos.z - 0.7);
        mesh.position.copy(start);
        this.crew.add(mesh);
        this.packets.push({ mesh, from: start, to, t: 0, dur: 1.4, arc: 2.6 });
        s.flash = Math.max(s.flash, 0.6);
      }
    }
  }

  /** Glowing dashed links on the floor between agents on linked missions. */
  private drawLinks(links: [number, number][]) {
    const sig = links.map((l) => l.join("-")).sort().join("|");
    if (sig === this.linkSig) return;
    this.linkSig = sig;
    disposeTree(this.links, false);
    this.links.clear();
    this.linkMats = [];
    for (const [a, b] of links) {
      const A = this.slots.get(a), B = this.slots.get(b);
      if (!A || !B) continue;
      const p1 = new THREE.Vector3(A.pos.x - 0.55, 0.08, A.pos.z + 1.35), p2 = new THREE.Vector3(B.pos.x - 0.55, 0.08, B.pos.z + 1.35);
      const mid = p1.clone().lerp(p2, 0.5).setY(0.08 + p1.distanceTo(p2) * 0.06);
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
      const mat = new THREE.LineDashedMaterial({ color: 0xc4b5fd, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.links.add(line);
      this.linkMats.push(mat);
    }
  }

  private drawClock() {
    if (!this.clock) return;
    const { g, t } = this.clock;
    const now = new Date();
    g.fillStyle = "#1e1f22"; g.fillRect(0, 0, 256, 320);
    g.strokeStyle = this.clock.on ? "#34d399" : "#9b9ba0"; g.lineWidth = 3;
    g.beginPath(); g.arc(128, 120, 86, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.sin(a) * 76, 120 - Math.cos(a) * 76); g.lineTo(128 + Math.sin(a) * 84, 120 - Math.cos(a) * 84); g.stroke(); }
    const h = (now.getHours() % 12) + now.getMinutes() / 60, m = now.getMinutes();
    g.lineWidth = 6; g.beginPath(); g.moveTo(128, 120); g.lineTo(128 + Math.sin((h / 12) * Math.PI * 2) * 46, 120 - Math.cos((h / 12) * Math.PI * 2) * 46); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(128, 120); g.lineTo(128 + Math.sin((m / 60) * Math.PI * 2) * 70, 120 - Math.cos((m / 60) * Math.PI * 2) * 70); g.stroke();
    g.fillStyle = this.clock.on ? "#34d399" : "#9b9ba0"; g.font = "bold 22px ui-monospace, monospace"; g.textAlign = "center";
    g.fillText(this.clock.on ? "ON SHIFT" : "SHIFT", 128, 236);
    g.fillStyle = "#cbd5e1"; g.font = "16px system-ui, sans-serif";
    wrap(g, this.clock.label.replace(/^On shift · |^Off shift · /, ""), 230, 2).forEach((ln, i) => g.fillText(ln, 128, 264 + i * 22));
    g.textAlign = "left";
    t.needsUpdate = true;
    this.clock.drawnAt = performance.now();
  }

  private drawMonitor(s: Slot) {
    const { g, t } = s.mon;
    const a = s.agent;
    const W = 384, H = 240;
    const hex = `#${PROVIDERS[a.provider].hex}`;
    g.fillStyle = "#1e1f22"; g.fillRect(0, 0, W, H);
    g.fillStyle = a.presence === "offline" ? "#334155" : a.presence === "waiting" ? "#e11d48" : hex; g.fillRect(0, 0, W, 34);
    g.fillStyle = "#fff"; g.font = "bold 20px system-ui, sans-serif"; g.textBaseline = "middle";
    g.fillText(a.name.toUpperCase(), 12, 18);
    g.textAlign = "right"; g.font = "16px system-ui, sans-serif";
    g.fillText(a.presence === "working" ? "● LIVE" : a.presence === "waiting" ? "✋ NEEDS YOU" : a.presence === "idle" ? "STANDBY" : "OFFLINE", W - 12, 18);
    g.textAlign = "left";
    if (a.presence === "offline" || !a.activity) {
      g.fillStyle = "#475569"; g.font = "bold 30px system-ui, sans-serif"; g.textAlign = "center";
      g.fillText(a.presence === "offline" ? "zZz  not connected" : a.cloud ? "☁  standing by" : "waiting for orders", W / 2, 130);
      g.textAlign = "left";
    } else {
      g.font = "44px system-ui, sans-serif"; g.fillStyle = "#fff";
      g.fillText(KIND_ICON[a.activityKind ?? "tool"] ?? "●", 14, 78);
      g.font = "600 24px system-ui, sans-serif"; g.fillStyle = "#e2e8f0";
      wrap(g, a.activity, W - 90, 3).forEach((ln, i) => g.fillText(ln, 74, 66 + i * 30));
      if (a.activityUrl) {
        let h = a.activityUrl;
        try { h = new URL(a.activityUrl).host; } catch { /* keep raw */ }
        g.fillStyle = "#8ea6ff"; g.font = "20px ui-monospace, monospace";
        g.fillText(h.slice(0, 34), 14, 196);
      }
      g.fillStyle = "rgba(255,255,255,.025)";
      for (let y = 40; y < H; y += 6) g.fillRect(0, y, W, 1); // scanlines
    }
    t.needsUpdate = true;
  }

  private drawBubble(s: Slot) {
    const { g, t } = s.bubble;
    const a = s.agent;
    g.clearRect(0, 0, 512, 128);
    if (!a.activity) { t.needsUpdate = true; return; }
    g.fillStyle = "rgba(38,39,43,.96)"; roundRect(g, 4, 4, 504, 96, 22); g.fill();
    g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 3; roundRect(g, 4, 4, 504, 96, 22); g.stroke();
    g.fillStyle = "#e8e8e6"; g.font = "600 30px system-ui, sans-serif"; g.textBaseline = "middle";
    const text = `${KIND_ICON[a.activityKind ?? "tool"] ?? ""} ${a.activity}`;
    wrap(g, text, 470, 2).forEach((ln, i, all) => g.fillText(ln, 22, (all.length === 1 ? 52 : 36) + i * 38));
    g.fillStyle = "rgba(38,39,43,.96)"; g.beginPath(); g.moveTo(236, 100); g.lineTo(256, 124); g.lineTo(276, 100); g.fill();
    t.needsUpdate = true;
  }

  private drawBoard(missions: MissionView[]) {
    if (!this.board) return;
    const sig = missions.map((m) => `${m.id}:${m.status}:${m.spentCents}`).join("|");
    if (sig === this.board.sig) return;
    this.board.sig = sig;
    const { g, t } = this.board;
    const W = 1792, H = 640;
    g.fillStyle = "#1e1f22"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#26272b"; g.fillRect(0, 0, W, 86);
    g.fillStyle = "#e8e8e6"; g.font = "bold 46px ui-monospace, monospace"; g.textBaseline = "middle";
    g.fillText("MISSION BOARD // TODAY", 40, 44);
    const cols = [
      { title: "OPEN", color: "#fbbf24", ms: missions.filter((m) => m.status === "open") },
      { title: "IN PROGRESS", color: "#38bdf8", ms: missions.filter((m) => m.status === "claimed" || m.status === "submitted") },
      { title: "DONE", color: "#34d399", ms: missions.filter((m) => m.status === "done") },
    ];
    cols.forEach((c, ci) => {
      const x = 40 + ci * 590;
      g.fillStyle = c.color; g.font = "bold 34px system-ui, sans-serif";
      g.fillText(`${c.title}  ${c.ms.length}`, x, 128);
      c.ms.slice(0, 6).forEach((m, i) => {
        const y = 160 + i * 74;
        g.fillStyle = "rgba(255,255,255,.06)"; roundRect(g, x, y, 560, 62, 12); g.fill();
        g.fillStyle = c.color; g.fillRect(x, y + 8, 6, 46);
        g.fillStyle = "#e2e8f0"; g.font = "600 28px system-ui, sans-serif";
        const budget = m.budgetCents ? `   $${(m.spentCents / 100).toFixed(0)}/$${(m.budgetCents / 100).toFixed(0)}` : "";
        const title = m.title.length > 30 ? `${m.title.slice(0, 29)}…` : m.title;
        g.fillText(title, x + 22, y + 31);
        if (budget) { g.fillStyle = m.spentCents > (m.budgetCents ?? 0) ? "#f87171" : "#94a3b8"; g.font = "22px ui-monospace, monospace"; g.textAlign = "right"; g.fillText(budget.trim(), x + 548, y + 31); g.textAlign = "left"; }
      });
      if (c.ms.length > 6) { g.fillStyle = "#64748b"; g.font = "26px system-ui, sans-serif"; g.fillText(`+ ${c.ms.length - 6} more`, x, 160 + 6 * 74 + 14); }
    });
    t.needsUpdate = true;
  }

  // ─── Building: the room (once) ────────────────────────────────────────────

  private lam(color: number, extra: THREE.MeshLambertMaterialParameters = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
  private glow(color: number, opacity = 1) { return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }); }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private buildRoom() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(6, 18, 10); s.add(key);
    const tableLight = new THREE.PointLight(0x8ea6ff, 18, 20, 1.8); tableLight.position.set(0, 4.5, -1.5); s.add(tableLight); // primary, softly
    const wallLight = new THREE.PointLight(0xffffff, 8, 18, 1.8); wallLight.position.set(0, 6, -9.5); s.add(wallLight);

    // Floor with a faint grid.
    const f = makeCanvas(512, 512);
    f.g.fillStyle = "#222327"; f.g.fillRect(0, 0, 512, 512);
    f.g.strokeStyle = "rgba(255,255,255,.05)"; f.g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { f.g.beginPath(); f.g.moveTo(i, 0); f.g.lineTo(i, 512); f.g.stroke(); f.g.beginPath(); f.g.moveTo(0, i); f.g.lineTo(512, i); f.g.stroke(); }
    const ft = tex(f.c); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(9, 7.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 30), this.lam(0xffffff, { map: ft }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); s.add(floor);

    // Back wall + side walls (low, so the camera can see over them).
    const wall = this.lam(0x26272b);
    this.box(s, 31, 9, 0.5, wall, 0, 4.5, -11.4);
    this.box(s, 0.5, 3.2, 26, wall, -15.2, 1.6, 1.5);
    this.box(s, 0.5, 3.2, 26, wall, 15.2, 1.6, 1.5);
    // Neon trim.
    this.box(s, 31, 0.1, 0.12, this.glow(0x3a3b41), 0, 0.12, -11.1);
    this.box(s, 31, 0.1, 0.12, this.glow(0x3a3b41), 0, 9, -11.1);
    this.box(s, 0.1, 0.1, 26, this.glow(0x3a3b41), -14.9, 3.2, 1.5);
    this.box(s, 0.1, 0.1, 26, this.glow(0x3a3b41), 14.9, 3.2, 1.5);

    // Mission wall: a big screen with a frame, and a row of small status panels either side.
    const b = makeCanvas(1792, 640);
    this.board = { g: b.g, t: tex(b.c), sig: "\u0000" };
    this.drawBoard([]);
    this.box(s, 15.4, 5.7, 0.3, this.lam(0x303136), 0, 5.4, -11.0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 5.3), new THREE.MeshBasicMaterial({ map: this.board.t }));
    screen.position.set(0, 5.4, -10.83); s.add(screen);
    for (const sx of [-12.5, 12.5]) {
      const p = makeCanvas(256, 320);
      if (sx < 0) {
        // Left panel: the shift clock (redrawn by drawClock).
        this.clock = { g: p.g, t: tex(p.c), label: "No shift set", on: false, drawnAt: 0 };
        this.drawClock();
        this.box(s, 3.4, 4.2, 0.2, this.lam(0x303136), sx, 5, -11.0);
        const cm = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.9), new THREE.MeshBasicMaterial({ map: this.clock.t }));
        cm.position.set(sx, 5, -10.88); s.add(cm);
        continue;
      }
      p.g.fillStyle = "#1e1f22"; p.g.fillRect(0, 0, 256, 320);
      p.g.strokeStyle = "#9b9ba0"; p.g.lineWidth = 3; p.g.beginPath(); p.g.arc(128, 150, 80, 0, Math.PI * 2); p.g.stroke();
      p.g.beginPath(); p.g.arc(128, 150, 40, 0, Math.PI * 2); p.g.stroke();
      p.g.beginPath(); p.g.moveTo(128, 150); p.g.lineTo(190, 110); p.g.stroke();
      p.g.fillStyle = "#9b9ba0"; p.g.font = "bold 24px ui-monospace, monospace"; p.g.fillText(sx < 0 ? "SIGINT" : "OVERWATCH", 30, 292);
      this.box(s, 3.4, 4.2, 0.2, this.lam(0x303136), sx, 5, -11.0);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.9), new THREE.MeshBasicMaterial({ map: tex(p.c) }));
      pm.position.set(sx, 5, -10.88); s.add(pm);
    }

    this.buildHoloTable();
  }

  private buildHoloTable() {
    const g = new THREE.Group();
    g.position.set(0, 0, -1.5);
    this.scene.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.1, 0.9, 40), this.lam(0x2a2b2f));
    base.position.y = 0.45; g.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.16, 40), this.lam(0x303136));
    top.position.y = 0.98; g.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.06, 8, 64), this.glow(0x6b8afd)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.08; g.add(rim);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.6, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: 0x6b8afd, transparent: true, opacity: 0.5 }));
      r.rotation.x = Math.PI / 2; r.position.y = 1.1; g.add(r); this.ringsHolo.push(r);
    }
    // Spinning wireframe globe.
    this.table.position.set(0, 2.5, 0);
    const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2), new THREE.MeshBasicMaterial({ color: 0x6b8afd, wireframe: true, transparent: true, opacity: 0.6 }));
    this.table.add(globe);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: 0xe8e8e6, wireframe: true }));
    this.table.add(core);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.02, 6, 64), this.glow(0xa78bfa)); band.rotation.x = Math.PI / 2.4; this.table.add(band);
    g.add(this.table);
  }

  // ─── Building: the crew (rebuilt when agents are added/removed) ───────────

  private layout(agents: AgentView[]) {
    for (const s of this.slots.values()) { disposeTree(s.root); this.crew.remove(s.root); }
    for (const o of this.shared) { disposeTree(o); this.crew.remove(o); }
    this.slots.clear();
    this.shared = [];
    this.packets = [];

    const byTeam = new Map<TeamKey, AgentView[]>();
    for (const a of agents) { const t = ROLES[a.role].team; byTeam.set(t, [...(byTeam.get(t) ?? []), a]); }

    for (const [team, list] of byTeam) {
      const pod = PODS[team];
      const rows = Math.ceil(list.length / 2);
      // Pod floor plate + label.
      const w = (list.length > 1 ? 2 : 1) * COL + 0.6, d = rows * ROW + 0.6;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAMS[team].hex), transparent: true, opacity: 0.12 }));
      plate.rotation.x = -Math.PI / 2; plate.position.set(pod.x, 0.02, pod.z + ((rows - 1) * ROW) / 2); this.crew.add(plate); this.shared.push(plate);
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAMS[team].hex) }));
      edge.rotation.x = -Math.PI / 2; edge.position.set(pod.x, 0.03, pod.z + ((rows - 1) * ROW) / 2 + d / 2); this.crew.add(edge); this.shared.push(edge);
      const lab = makeCanvas(512, 96);
      lab.g.fillStyle = TEAMS[team].hex; lab.g.font = "bold 54px ui-monospace, monospace"; lab.g.textBaseline = "middle"; lab.g.textAlign = "center";
      lab.g.fillText(TEAMS[team].label.toUpperCase(), 256, 50);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (96 / 512)), new THREE.MeshBasicMaterial({ map: tex(lab.c), transparent: true }));
      label.rotation.x = -Math.PI / 2; label.position.set(pod.x, 0.04, pod.z + ((rows - 1) * ROW) / 2 + d / 2 + 0.5); this.crew.add(label); this.shared.push(label);

      list.forEach((a, i) => {
        const row = Math.floor(i / 2), inRow = row === rows - 1 && list.length % 2 === 1 ? 1 : 2;
        const col = i % 2;
        const x = pod.x + (col - (inRow - 1) / 2) * COL, z = pod.z + row * ROW;
        this.slots.set(a.id, this.buildAgent(a, new THREE.Vector3(x, 0, z)));
      });
    }
  }

  private buildAgent(a: AgentView, pos: THREE.Vector3): Slot {
    const root = new THREE.Group();
    root.position.copy(pos);
    this.crew.add(root);
    const seed = (hash(a.id) % 628) / 100;
    const skin = SKIN[hash(a.id) % SKIN.length], hair = HAIR[hash(a.id * 7) % HAIR.length];
    const bodyColor = BODY[a.role];

    // Desk in front, agent seated BEHIND it facing the camera (+z), monitor angled beside them.
    const desk = this.lam(0x34353b);
    this.box(root, 2.6, 0.12, 1.2, desk, 0, 0.85, 0.2);
    this.box(root, 2.4, 0.78, 1.0, this.lam(0x2a2b2f), 0, 0.42, 0.25);
    this.box(root, 0.7, 0.04, 0.26, this.lam(0x0f172a), -0.55, 0.93, 0.4); // keyboard
    const chair = new THREE.Group(); chair.position.set(-0.55, 0, -0.7); root.add(chair);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), this.lam(0x3a3b41)); seat.position.y = 0.55; chair.add(seat);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), this.lam(0x111827)); post.position.y = 0.28; chair.add(post);
    this.box(chair, 0.9, 0.95, 0.1, this.lam(0x3a3b41), 0, 1.05, -0.5);

    const mc = makeCanvas(384, 240);
    const mon = new THREE.MeshBasicMaterial({ map: tex(mc.c) });
    const monGroup = new THREE.Group(); monGroup.position.set(0.8, 1.55, 0.15); monGroup.rotation.y = -0.28; root.add(monGroup);
    this.box(monGroup, 1.7, 1.1, 0.07, this.lam(0x0b1020), 0, 0, 0);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.98), mon); scr.position.z = 0.04; monGroup.add(scr);
    this.box(monGroup, 0.12, 0.5, 0.1, this.lam(0x111827), 0, -0.78, -0.05);

    // The agent.
    const ag = new THREE.Group(); ag.position.set(-0.55, 0.62, -0.7); root.add(ag);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 14), this.lam(bodyColor)); body.position.y = 0.55; ag.add(body);
    const head = new THREE.Group(); head.position.y = 1.2; ag.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 20), this.lam(skin)));
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x141414 });
    const eyes: THREE.Object3D[] = [];
    for (const sx of [-0.16, 0.16]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeMat); e.position.set(sx, 0.04, 0.39); head.add(e); eyes.push(e);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), this.glow(0xffffff)); sh.position.set(sx + 0.02, 0.07, 0.445); head.add(sh);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this.lam(0xff9aa8, { transparent: true, opacity: 0.7 })); ch.scale.set(1, 0.6, 0.4); ch.position.set(sx * 1.75, -0.1, 0.35); head.add(ch);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 12, Math.PI), this.glow(0x4a2c2a)); smile.rotation.z = Math.PI; smile.position.set(0, -0.1, 0.42); head.add(smile);
    // Arms hang from the shoulders and swing forward to the keyboard.
    const mkArm = (sx: number) => {
      const g = new THREE.Group(); g.position.set(sx, 0.95, 0.05);
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), this.lam(bodyColor)); c.position.y = -0.22; g.add(c);
      g.rotation.x = -1.1; ag.add(g); return g;
    };
    const armL = mkArm(-0.36), armR = mkArm(0.36);

    // Desk props sit on the desk's left; they were designed around its centre, so offset them forward.
    const props = new THREE.Group(); props.position.set(0, 0, 0.55); root.add(props);
    const prop = this.dressAgent(a.role, ag, head, props, hair);

    // Provider badge over the head, speech bubble above it, name plate on the desk front.
    const logo = PROVIDER_LOGO[a.provider];
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTexture(logo.path, logo.hex, logo.mono, logo.evenodd), depthWrite: false }));
    badge.scale.setScalar(0.66); badge.position.set(-0.55, 3.25, -0.7); root.add(badge);
    const nt = makeCanvas(512, 112);
    nt.g.fillStyle = "rgba(38,39,43,.96)"; roundRect(nt.g, 2, 2, 508, 108, 24); nt.g.fill();
    nt.g.strokeStyle = TEAMS[ROLES[a.role].team].hex; nt.g.lineWidth = 4; roundRect(nt.g, 2, 2, 508, 108, 24); nt.g.stroke();
    nt.g.fillStyle = "#fff"; nt.g.font = "bold 50px system-ui, sans-serif"; nt.g.textAlign = "center"; nt.g.textBaseline = "middle";
    nt.g.fillText(a.name.slice(0, 16), 256, 40);
    nt.g.fillStyle = TEAMS[ROLES[a.role].team].hex; nt.g.font = "34px system-ui, sans-serif"; nt.g.fillText(ROLES[a.role].label, 256, 84);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.37), new THREE.MeshBasicMaterial({ map: tex(nt.c), transparent: true }));
    plate.position.set(0, 0.5, 0.77); root.add(plate);
    const bc = makeCanvas(512, 128);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(bc.c), transparent: true, opacity: 0, depthWrite: false }));
    bubble.scale.set(3.3, 0.82, 1); bubble.position.set(-0.55, 4.1, -0.7); root.add(bubble);

    // Status pad on the floor in front of the desk + an invisible hit target for clicking.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-0.55, 0.04, 1.35); root.add(ring);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.7, 0); hit.userData.agentId = a.id; root.add(hit);

    // "Needs you" beacon: a red siren with two sweeping beams, on top of the monitor.
    const beacon = new THREE.Group(); beacon.position.set(0.8, 2.32, 0.1); beacon.visible = false; root.add(beacon);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), this.glow(0xf43f5e)); beacon.add(bulb);
    for (const r of [0, Math.PI]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      beam.rotation.z = Math.PI / 2; beam.rotation.y = r; beam.position.x = Math.cos(r) * 0.55; beam.position.z = -Math.sin(r) * 0.55; beacon.add(beam);
    }

    // Cloud agents get a small server rack beside the monitor: it blinks while they work.
    let rack: THREE.Mesh[] | null = null;
    if (a.cloud) {
      this.box(root, 0.5, 1.3, 0.5, this.lam(0x111827), 1.55, 0.65, -0.55);
      rack = [];
      for (let i = 0; i < 4; i++) { const l = this.box(root, 0.08, 0.06, 0.02, this.glow(0x0f3b2c), 1.42 + (i % 2) * 0.16, 0.45 + Math.floor(i / 2) * 0.35, -0.29); rack.push(l); }
      const cs = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(), depthWrite: false })); cs.scale.setScalar(0.42); cs.position.set(-0.05, 3.3, -0.7); root.add(cs);
    }

    const slot: Slot = {
      agent: a, root, pos: pos.clone(), head, armL, armR, eyes, prop, ring, hit, beacon, rack,
      mon: { g: mc.g, t: mon.map as THREE.CanvasTexture, sig: "\u0000", mat: mon },
      bubble: { g: bc.g, t: bubble.material.map as THREE.CanvasTexture, sprite: bubble, sig: "" },
      seed, flash: 0, nextBlink: 1 + (seed % 3),
    };
    this.updateAgentFirst(slot, a);
    return slot;
  }

  private updateAgentFirst(s: Slot, a: AgentView) {
    s.mon.sig = `${a.presence}|${a.activity}|${a.activityKind}|${a.activityUrl}`;
    this.drawMonitor(s);
    this.drawBubble(s);
  }

  /** Role costume and desk prop. Returns the prop that fidgets while the agent works. */
  private dressAgent(role: RoleKey, ag: THREE.Group, head: THREE.Group, root: THREE.Group, hair: number): THREE.Object3D | null {
    const hairCap = () => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.47, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), this.lam(hair)); h.position.set(0, 0.03, -0.05); head.add(h); };
    let prop: THREE.Object3D | null = null;
    switch (role) {
      case "scout": { // fedora + binoculars
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 24), this.lam(0x2b2118)); brim.position.y = 0.4; head.add(brim);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.3, 20), this.lam(0x3a2d20)); crown.position.y = 0.55; head.add(crown);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.07, 20), this.lam(0xc0392b)); band.position.y = 0.45; head.add(band);
        for (const sx of [-0.11, 0.11]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 12), this.lam(0x111827)); b.rotation.x = Math.PI / 2; b.position.set(sx, 0.78, 0.36); ag.add(b); }
        const dish = new THREE.Group(); dish.position.set(-0.85, 0.95, -0.3); root.add(dish);
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.lam(0xb8c2d0)); d.rotation.x = Math.PI * 0.7; d.position.y = 0.3; dish.add(d);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), this.lam(0x6b7280)); st.position.y = 0.12; dish.add(st);
        prop = dish; break;
      }
      case "researcher": { // glasses + magnifier + books
        hairCap();
        for (const sx of [-0.16, 0.16]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 6, 16), this.lam(0x1f2937)); r.position.set(sx, 0.04, 0.42); head.add(r); }
        this.box(head, 0.1, 0.015, 0.015, this.lam(0x1f2937), 0, 0.06, 0.43);
        const mag = new THREE.Group(); mag.position.set(-0.85, 1.15, 0.05); root.add(mag);
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24), this.lam(0xc9a227)); mag.add(lens);
        const lensG = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.45 })); mag.add(lensG);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), this.lam(0x6b4423)); h.position.set(0.17, -0.25, 0); h.rotation.z = 0.7; mag.add(h);
        this.box(root, 0.5, 0.1, 0.36, this.lam(0xb4553f), -0.85, 0.96, -0.55); this.box(root, 0.46, 0.1, 0.34, this.lam(0x2563eb), -0.85, 1.06, -0.55);
        prop = mag; break;
      }
      case "builder": { // hard hat + wrench
        const hat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.lam(0xfacc15)); hat.position.y = 0.12; head.add(hat);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.05, 20), this.lam(0xeab308)); brim.position.set(0, 0.14, 0.12); head.add(brim);
        this.box(head, 0.1, 0.06, 0.5, this.lam(0xeab308), 0, 0.6, 0);
        const w = new THREE.Group(); w.position.set(-0.85, 1.0, 0.1); root.add(w);
        this.box(w, 0.1, 0.5, 0.06, this.lam(0xb8c2d0), 0, 0.25, 0);
        const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 6, 12, Math.PI * 1.5), this.lam(0xb8c2d0)); jaw.position.y = 0.55; w.add(jaw);
        w.rotation.z = -0.5; this.box(root, 0.5, 0.18, 0.4, this.lam(0xd97706), -0.3, 1.02, -0.6);
        prop = w; break;
      }
      case "reviewer": { // glasses + clipboard
        hairCap();
        for (const sx of [-0.16, 0.16]) this.box(head, 0.19, 0.14, 0.02, this.lam(0x1d4ed8), sx, 0.04, 0.42);
        const clip = new THREE.Group(); clip.position.set(-1.12, 1.22, 0.0); clip.rotation.y = 0.6; root.add(clip);
        this.box(clip, 0.55, 0.72, 0.04, this.lam(0x7c4a24), 0, 0, 0);
        const pc = makeCanvas(128, 160); pc.g.fillStyle = "#fff"; pc.g.fillRect(0, 0, 128, 160);
        pc.g.strokeStyle = "#16a34a"; pc.g.lineWidth = 10; pc.g.beginPath(); pc.g.moveTo(26, 82); pc.g.lineTo(54, 112); pc.g.lineTo(104, 40); pc.g.stroke();
        pc.g.fillStyle = "#cbd5e1"; for (let y = 128; y < 152; y += 8) pc.g.fillRect(20, y, 88, 3);
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshBasicMaterial({ map: tex(pc.c) })); paper.position.z = 0.03; clip.add(paper);
        prop = clip; break;
      }
      case "scribe": { // beret + paper stack + quill
        const bm = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 10), this.lam(0x4c1d95)); bm.scale.set(1, 0.38, 1); bm.position.set(0.05, 0.38, 0); bm.rotation.z = -0.15; head.add(bm);
        const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 6), this.lam(0x4c1d95)); nub.position.set(0.05, 0.58, 0); head.add(nub);
        for (let i = 0; i < 5; i++) this.box(root, 0.6, 0.04, 0.8, this.lam(i % 2 ? 0xf5f1e6 : 0xfffdf6), -0.9 + (i % 2) * 0.03, 0.93 + i * 0.045, -0.45);
        const q = new THREE.Group(); q.position.set(-0.85, 1.25, 0.1); root.add(q);
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 8), this.lam(0xf8fafc)); feather.position.y = 0.2; q.add(feather); q.rotation.z = -0.4;
        prop = q; break;
      }
      case "treasurer": { // green visor + calculator + coins
        hairCap();
        const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 20, 1, false, -Math.PI * 0.55, Math.PI * 1.1), this.lam(0x22c55e, { transparent: true, opacity: 0.8 })); visor.position.set(0, 0.28, 0.1); visor.rotation.x = 0.0; head.add(visor);
        const vb = new THREE.Mesh(new THREE.CylinderGeometry(0.465, 0.465, 0.12, 20, 1, true), this.lam(0x14532d)); vb.position.y = 0.3; head.add(vb);
        this.box(root, 0.5, 0.06, 0.7, this.lam(0x1f2937), -0.85, 0.94, -0.4);
        const calc = new THREE.Group(); calc.position.set(-0.85, 1.0, -0.4); root.add(calc);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.box(calc, 0.09, 0.03, 0.09, this.lam(0xe5e7eb), -0.12 + c * 0.12, 0.04, -0.05 + r * 0.14);
        for (let i = 0; i < 4; i++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), this.lam(0xfacc15)); coin.position.set(-1.1, 0.97 + i * 0.045, 0.1); root.add(coin); }
        prop = calc; break;
      }
      case "comms": { // headset + megaphone
        hairCap();
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.04, 8, 24, Math.PI), this.lam(0x111827)); arc.position.y = 0.04; head.add(arc);
        for (const sx of [-0.47, 0.47]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), this.lam(0x14b8a6)); cup.rotation.z = Math.PI / 2; cup.position.set(sx, 0.02, 0); head.add(cup); }
        const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), this.lam(0x111827)); boom.rotation.set(0.2, 0, 1.0); boom.position.set(0.3, -0.12, 0.3); head.add(boom);
        const mp = new THREE.Group(); mp.position.set(-0.85, 1.12, 0); root.add(mp);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.08, 0.42, 14), this.lam(0xef4444)); cone.rotation.z = Math.PI / 2; mp.add(cone);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), this.lam(0x111827)); grip.position.set(0.05, -0.16, 0); mp.add(grip);
        prop = mp; break;
      }
      case "chief": { // earpiece + red tie + tablet
        hairCap();
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this.lam(0x111827)); ear.position.set(0.44, 0, 0.05); head.add(ear);
        const cord = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 14, Math.PI * 1.2), this.glow(0x111827)); cord.position.set(0.4, -0.25, 0.0); cord.rotation.y = Math.PI / 2; head.add(cord);
        this.box(ag, 0.12, 0.42, 0.04, this.lam(0xdc2626), 0, 0.72, 0.31);
        this.box(ag, 0.16, 0.1, 0.05, this.lam(0xdc2626), 0, 0.96, 0.3);
        const tb = new THREE.Group(); tb.position.set(-0.85, 1.12, -0.1); tb.rotation.set(-0.5, 0.5, 0); root.add(tb);
        this.box(tb, 0.7, 0.48, 0.04, this.lam(0x111827), 0, 0, 0);
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.42), new THREE.MeshBasicMaterial({ color: 0x14532d })); sc.position.z = 0.025; tb.add(sc);
        const sc2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.04), new THREE.MeshBasicMaterial({ color: 0x6b8afd })); sc2.position.set(0, 0.1, 0.03); tb.add(sc2);
        prop = tb; break;
      }
    }
    return prop;
  }
}

/** A small white cloud on a sky-blue badge: marks agents that run in Galaxus cloud. */
function cloudTexture() {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = "#0ea5e9"; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff";
  for (const [x, y, r] of [[48, 70, 20], [70, 60, 26], [88, 74, 17]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillRect(40, 70, 56, 21);
  return tex(c);
}

function disposeTree(root: THREE.Object3D, includeSelf = true) {
  root.traverse((o) => {
    if (!includeSelf && o === root) return;
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as (THREE.Material & { map?: THREE.Texture | null })[];
    for (const mat of mats) { mat.map?.dispose(); mat.dispose(); }
  });
}
