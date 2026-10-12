// Everything that makes the city feel alive from your real data:
// weather + clouds + rain, mail vans / reply vans / armored money trucks on the
// roads, Claude beams, radar pings, opportunity airships, construction sites
// for goals, streak lights around the plaza, the vault's gold pile, fireworks.
//
// Owned by EmpireEngine; it hands us the scene and a way to find buildings.
// Every mesh type uses shared geometries/materials, and short-lived effects
// are removed (and disposed) as soon as they finish.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GROUNDS, type Airship, type GoalSite, type GroundKey, type Weather } from "@/lib/empire-world";

export const RING_INNER = 13;
export const RING_OUTER = 31;
export const SITE_RADIUS = 41;

type Host = {
  scene: THREE.Scene;
  quality: "low" | "high";
  posOf: (id: string) => THREE.Vector3 | null; // building base (world)
  topOf: (id: string) => number; // building height
  setAnchor: (id: string, obj: THREE.Object3D | null, top: number) => void;
  clearTreesNear: (points: THREE.Vector3[], r: number) => void;
};

type Courier = { obj: THREE.Object3D; path: THREE.Vector3[]; lens: number[]; total: number; d: number; speed: number; fadeOut: boolean; onArrive?: () => void };
type Fx = { obj: THREE.Object3D; t: number; life: number; update: (k: number, dt: number) => void };
type Ship = { data: Airship; group: THREE.Group; slot: THREE.Vector3; t: number; landing: number; label: THREE.Sprite };
type Site = { data: GoalSite; group: THREE.Group; arm: THREE.Object3D | null; pos: THREE.Vector3 };

const lerp = THREE.MathUtils.lerp;
const ease = (k: number) => k * k * (3 - 2 * k);

export function textSprite(text: string, sub: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(15,18,24,0.82)";
  g.beginPath(); g.roundRect(4, 4, 504, 152, 36); g.fill();
  g.fillStyle = color; g.beginPath(); g.roundRect(4, 4, 18, 152, [36, 0, 0, 36]); g.fill();
  g.fillStyle = "#fff"; g.font = "600 46px system-ui, sans-serif"; g.textBaseline = "middle";
  const t = text.length > 22 ? `${text.slice(0, 21)}…` : text;
  g.fillText(t, 44, 62);
  g.fillStyle = "rgba(255,255,255,0.65)"; g.font = "500 32px system-ui, sans-serif";
  g.fillText(sub, 44, 118);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(9, 2.8, 1);
  return s;
}

export class CityLife {
  private couriers: Courier[] = [];
  private fx: Fx[] = [];
  private ships = new Map<number, Ship>();
  private sites = new Map<number, Site>();
  pickables: THREE.Object3D[] = [];

  // Weather
  private weather: Weather = "sun";
  overcast = 0; // eased 0 (clear) … 1 (storm); the engine tints sky and sun with it
  private clouds!: THREE.InstancedMesh;
  private cloudState: { a: number; r: number; y: number; s: number; v: number }[] = [];
  private cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, emissive: 0x9aa8b8, emissiveIntensity: 0.25 });
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;

  // Streak lights
  private bulbs!: THREE.InstancedMesh;
  private litTarget = 0;
  private litShown = 0;
  private bulbTimer = 0;

  // Vault + runner
  private gold!: THREE.InstancedMesh;
  private goldFill = 0;
  private runnerGlow: THREE.Mesh | null = null;
  private runnerWorking = false;
  private sweep: THREE.Mesh | null = null;
  private scanning = false;

  // Shared vehicle parts
  private vanGeo: THREE.BufferGeometry;
  private truckGeo: THREE.BufferGeometry;
  private mats = {
    van: new THREE.MeshLambertMaterial({ color: 0xf5f3ee }),
    vanRoof: new THREE.MeshLambertMaterial({ color: 0x2f6fde }),
    flag: new THREE.MeshLambertMaterial({ color: 0xe5383b, side: THREE.DoubleSide }),
    pole: new THREE.MeshLambertMaterial({ color: 0x2c3138 }),
    armored: new THREE.MeshLambertMaterial({ color: 0x4a5560 }),
    band: new THREE.MeshLambertMaterial({ color: 0xe0b44c, emissive: 0x5a3c00, emissiveIntensity: 0.4 }),
  };

  constructor(private h: Host) {
    const body = new THREE.BoxGeometry(1.7, 0.9, 0.95); body.translate(0, 0.65, 0);
    const nose = new THREE.BoxGeometry(0.55, 0.6, 0.9); nose.translate(1.05, 0.5, 0);
    this.vanGeo = mergeGeometries([body, nose]);
    const tb = new THREE.BoxGeometry(2.2, 1.15, 1.15); tb.translate(-0.2, 0.8, 0);
    const tc = new THREE.BoxGeometry(0.7, 0.85, 1.1); tc.translate(1.25, 0.62, 0);
    this.truckGeo = mergeGeometries([tb, tc]);
    this.buildWeather();
    this.buildStreakLights();
    this.buildGold();
  }

  // ─── Nature: a grass gradient with patches, tufts and flowers ──────────────

  /** Vertex-coloured ground: light, trimmed grass in town, deeper meadow outside, soft patches. */
  static groundGeometry(preset: GroundKey = "grass") {
    const geo = new THREE.RingGeometry(0.01, 160, 96, 48);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const g = GROUNDS[preset];
    const inner = new THREE.Color(g.inner), outer = new THREE.Color(g.outer), dry = new THREE.Color(g.dry), lush = new THREE.Color(g.lush);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      c.copy(inner).lerp(outer, THREE.MathUtils.smoothstep(r, 30, 110));
      // Cheap value-noise patches (sum of sines) — dry and lush spots.
      const nz = Math.sin(x * 0.11 + 1.3) * Math.cos(y * 0.09 - 0.7) + Math.sin((x + y) * 0.05) * 0.6;
      if (nz > 0.55) c.lerp(dry, Math.min(0.55, (nz - 0.55) * 1.2));
      else if (nz < -0.6) c.lerp(lush, Math.min(0.6, (-0.6 - nz) * 1.2));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  /** Grass tufts and flower dots outside the roads (two instanced meshes). */
  buildMeadow() {
    const tufts = this.h.quality === "high" ? 700 : 300;
    const tuftMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), tufts);
    const flowers = this.h.quality === "high" ? 260 : 110;
    const flowerMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), flowers);
    const o = new THREE.Object3D(), c = new THREE.Color();
    const spot = () => {
      for (;;) {
        const r = Math.random() < 0.3 ? PLOT_GAP() : RING_OUTER + 4 + Math.random() * 70;
        if (Math.abs(r - RING_INNER) > 3 && Math.abs(r - RING_OUTER) > 3 && r > RING_INNER) return { r, a: Math.random() * Math.PI * 2 };
      }
    };
    for (let i = 0; i < tufts; i++) {
      const { r, a } = spot();
      o.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r); o.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.3); o.scale.setScalar(0.6 + Math.random() * 0.9); o.updateMatrix();
      tuftMesh.setMatrixAt(i, o.matrix); tuftMesh.setColorAt(i, c.setHSL(0.27 + Math.random() * 0.06, 0.5, 0.3 + Math.random() * 0.12));
    }
    const petals = [0xffffff, 0xffd166, 0xef476f, 0xc77dff, 0x8ecae6];
    for (let i = 0; i < flowers; i++) {
      const { r, a } = spot();
      o.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r); o.rotation.set(0, 0, 0); o.scale.setScalar(0.8 + Math.random() * 0.6); o.updateMatrix();
      flowerMesh.setMatrixAt(i, o.matrix); flowerMesh.setColorAt(i, c.setHex(petals[i % petals.length]));
    }
    this.h.scene.add(tuftMesh, flowerMesh);
  }

  // ─── Weather ───────────────────────────────────────────────────────────────

  private buildWeather() {
    const puffs: THREE.BufferGeometry[] = [];
    for (const [x, y, z, r] of [[0, 0, 0, 2.6], [2.4, -0.3, 0.4, 2], [-2.3, -0.4, -0.2, 2.1], [1, 0.9, -0.6, 1.8], [-0.9, 0.7, 0.8, 1.7]]) {
      const s = new THREE.IcosahedronGeometry(r, 3); s.translate(x, y, z); puffs.push(s);
    }
    const geo = mergeGeometries(puffs); geo.scale(1, 0.62, 0.8);
    const count = this.h.quality === "high" ? 18 : 10;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, count);
    for (let i = 0; i < count; i++) this.cloudState.push({ a: Math.random() * Math.PI * 2, r: 45 + Math.random() * 65, y: 22 + Math.random() * 10, s: 1 + Math.random() * 1.4, v: (0.012 + Math.random() * 0.015) * (Math.random() < 0.5 ? 1 : -1) });
    this.h.scene.add(this.clouds);

    const drops = this.h.quality === "high" ? 1800 : 700;
    this.rainPos = new Float32Array(drops * 6);
    for (let i = 0; i < drops; i++) this.resetDrop(i, Math.random() * 50);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8cadb, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.h.scene.add(this.rain);
  }

  private resetDrop(i: number, y: number) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 75;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    this.rainPos.set([x, y, z, x + 0.15, y + 1.1, z], i * 6);
  }

  setWeather(w: Weather) { this.weather = w; }

  private tickWeather(dt: number, night: number) {
    const target = this.weather === "rain" ? 1 : this.weather === "clouds" ? 0.45 : 0;
    this.overcast += (target - this.overcast) * Math.min(1, dt * 0.8);
    const visible = Math.round(lerp(this.h.quality === "high" ? 7 : 4, this.cloudState.length, Math.min(1, this.overcast * 1.6)));
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x8a939d), this.overcast * 0.8).lerp(new THREE.Color(0x2a3140), night * 0.7);
    const o = new THREE.Object3D();
    this.cloudState.forEach((c, i) => {
      c.a += c.v * dt;
      const show = i < visible;
      o.position.set(Math.cos(c.a) * c.r, c.y - this.overcast * 6, Math.sin(c.a) * c.r);
      o.rotation.set(0, c.a, 0);
      o.scale.setScalar(show ? c.s * (1 + this.overcast * 0.5) : 0.0001);
      o.updateMatrix();
      this.clouds.setMatrixAt(i, o.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;

    const raining = this.overcast > 0.75;
    this.rain.visible = raining;
    if (raining) {
      const fall = 38 * dt;
      for (let i = 0; i < this.rainPos.length / 6; i++) {
        const y = this.rainPos[i * 6 + 1] - fall;
        if (y < 0) this.resetDrop(i, 40 + Math.random() * 10);
        else { this.rainPos[i * 6 + 1] = y; this.rainPos[i * 6 + 4] = y + 1.1; this.rainPos[i * 6] -= 0.15 * dt; this.rainPos[i * 6 + 3] -= 0.15 * dt; }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  isRaining() { return this.overcast > 0.75; }

  // ─── Streak lights ─────────────────────────────────────────────────────────

  private static BULBS = 60;
  private buildStreakLights() {
    const n = CityLife.BULBS, r = RING_INNER - 2.6;
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 4), this.mats.pole, n);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const o = new THREE.Object3D(), c = new THREE.Color(0x4b5058);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.position.set(Math.cos(a) * r, 0.65, Math.sin(a) * r); o.updateMatrix(); posts.setMatrixAt(i, o.matrix);
      o.position.y = 1.45; o.updateMatrix(); this.bulbs.setMatrixAt(i, o.matrix); this.bulbs.setColorAt(i, c);
    }
    this.h.scene.add(posts, this.bulbs);
  }

  /** One bulb per streak day. If the streak broke since last time, they go out one by one. */
  setStreak(days: number, previous: number | null) {
    this.litTarget = Math.min(CityLife.BULBS, Math.max(0, days));
    if (previous != null && previous > days) this.litShown = Math.min(CityLife.BULBS, previous);
    else if (this.litShown === 0) this.litShown = 0; // light up from zero on first view
  }

  private tickBulbs(dt: number, t: number) {
    this.bulbTimer += dt;
    const step = this.litShown > this.litTarget ? 0.14 : 0.05;
    while (this.bulbTimer > step && this.litShown !== this.litTarget) {
      this.bulbTimer -= step;
      this.litShown += this.litShown < this.litTarget ? 1 : -1;
    }
    const c = new THREE.Color();
    for (let i = 0; i < CityLife.BULBS; i++) {
      if (i < this.litShown) c.setHSL(0.12, 1, 0.62 + Math.sin(t * 3 + i * 0.7) * 0.06);
      else c.setHex(0x4b5058);
      this.bulbs.setColorAt(i, c);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  // ─── Vault gold + runner glow + radar sweep (re-attached after relayout) ───

  private buildGold() {
    this.gold = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.28, 0.36), this.mats.band, 45);
    this.gold.castShadow = true;
    this.h.scene.add(this.gold);
  }

  setGold(fill: number) { this.goldFill = Math.max(0, Math.min(1, fill)); this.layoutGold(); }

  private layoutGold(extra = 0) {
    const v = this.h.posOf("vault");
    const o = new THREE.Object3D();
    const count = v ? Math.min(45, Math.round(this.goldFill * 45) + extra) : 0;
    if (v) {
      const toward = v.clone().multiplyScalar(-1).setY(0).normalize();
      const side = new THREE.Vector3(-toward.z, 0, toward.x);
      const base = v.clone().addScaledVector(toward, 3.7);
      let i = 0;
      for (let layer = 0; layer < 5 && i < count; layer++) {
        const row = 5 - layer;
        for (let a = 0; a < row && i < count; a++) for (let b = 0; b < 2 && i < count; b++, i++) {
          o.position.copy(base).addScaledVector(side, (a - (row - 1) / 2) * 0.74).addScaledVector(toward, (b - 0.5) * 0.4);
          o.position.y = 0.14 + layer * 0.29;
          o.rotation.set(0, Math.atan2(side.x, side.z), 0); o.updateMatrix();
          this.gold.setMatrixAt(i, o.matrix);
        }
      }
    }
    this.gold.count = count;
    this.gold.instanceMatrix.needsUpdate = true;
  }

  /** Called after the engine relays the city out (buildings moved / rebuilt). */
  relayout() {
    this.layoutGold();
    for (const m of [this.runnerGlow, this.sweep]) if (m) { this.h.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.runnerGlow = null; this.sweep = null;
    const r = this.h.posOf("runner");
    if (r) {
      this.runnerGlow = new THREE.Mesh(new THREE.SphereGeometry(5.2, 20, 12), new THREE.MeshBasicMaterial({ color: 0xd97757, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.runnerGlow.position.copy(r).setY(3);
      this.h.scene.add(this.runnerGlow);
    }
    const rad = this.h.posOf("radar");
    if (rad) {
      this.sweep = new THREE.Mesh(new THREE.CircleGeometry(16, 24, 0, 0.7), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      this.sweep.rotation.x = -Math.PI / 2;
      this.sweep.position.copy(rad).setY(0.12);
      this.h.scene.add(this.sweep);
    }
    for (const s of this.sites.values()) this.h.setAnchor(`goal:${s.data.id}`, s.group, this.siteTop(s.data));
  }

  setRunnerWorking(on: boolean) { this.runnerWorking = on; }
  setRadarScanning(on: boolean) { this.scanning = on; }

  // ─── Vehicles on the roads ─────────────────────────────────────────────────

  private static ringPoint(a: number, r: number) { return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r); }
  private static angle(v: THREE.Vector3) { return Math.atan2(v.z, v.x); }

  /** Building → inner ring → along it → building (or → HQ, or off the map along its avenue). */
  private route(from: THREE.Vector3 | "edge", to: THREE.Vector3 | "edge" | "hq", lane: number) {
    const r = RING_INNER + lane;
    if (from === "edge") {
      const v = to as THREE.Vector3, a = CityLife.angle(v);
      return [CityLife.ringPoint(a, 95), CityLife.ringPoint(a, RING_OUTER + lane), v.clone().setY(0)];
    }
    const aFrom = CityLife.angle(from);
    const pts = [from.clone().setY(0)];
    if (to === "edge") { pts.push(CityLife.ringPoint(aFrom, RING_OUTER + lane), CityLife.ringPoint(aFrom, 95)); return pts; }
    pts.push(CityLife.ringPoint(aFrom, r));
    if (to === "hq") { pts.push(CityLife.ringPoint(aFrom, 5.5)); return pts; }
    let d = CityLife.angle(to) - aFrom;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.15));
    for (let i = 1; i <= steps; i++) pts.push(CityLife.ringPoint(aFrom + (d * i) / steps, r));
    pts.push(to.clone().setY(0));
    return pts;
  }

  private drive(obj: THREE.Object3D, path: THREE.Vector3[], speed: number, opts: { fadeOut?: boolean; onArrive?: () => void } = {}) {
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
    obj.position.copy(path[0]);
    this.h.scene.add(obj);
    this.couriers.push({ obj, path, lens, total: lens[lens.length - 1], d: 0, speed, fadeOut: !!opts.fadeOut, onArrive: opts.onArrive });
    if (this.couriers.length > 16) this.finishCourier(this.couriers[0]); // never let traffic pile up
  }

  private van(flag: boolean) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.vanGeo, this.mats.van); body.castShadow = this.h.quality === "high"; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.98), this.mats.vanRoof); roof.position.y = 1.16; g.add(roof);
    if (flag) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), this.mats.pole); pole.position.set(-0.6, 1.85, 0); g.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.45), this.mats.flag); f.position.set(-0.22, 2.3, 0); g.add(f);
    }
    g.scale.setScalar(1.25);
    return g;
  }

  private armored(amount: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.truckGeo, this.mats.armored); body.castShadow = this.h.quality === "high"; g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.16, 1.18), this.mats.band); band.position.set(-0.2, 0.95, 0); g.add(band);
    g.scale.setScalar(1.1 + Math.min(1.1, Math.log10(Math.max(1, amount)) / 3)); // bigger payment, bigger truck
    return g;
  }

  /** A sent/drafted email leaves the factory and drives off the map. */
  mailOut(): void {
    const from = this.h.posOf("autopilot"); if (!from) return;
    this.drive(this.van(false), this.route(from, "edge", 0.9), 9, { fadeOut: true });
  }

  /** A reply arrives from outside with a red flag and parks at the factory. */
  replyIn(): void {
    const to = this.h.posOf("autopilot"); if (!to) return;
    this.drive(this.van(true), this.route("edge", to, -0.9), 9);
  }

  /** Money drives into the vault; the gold pile grows when it arrives. */
  moneyIn(fromId: string, amount: number, onArrive?: () => void): void {
    const vault = this.h.posOf("vault"); if (!vault) return;
    const from = this.h.posOf(fromId) ?? new THREE.Vector3(0, 0, 0);
    const path = fromId === "hq" ? [new THREE.Vector3(0, 0, 0), ...this.route(vault, "hq", 0.9).reverse()] : this.route(from, vault, 0.9);
    this.drive(this.armored(amount), path, 7, { onArrive: () => { this.layoutGold(2); onArrive?.(); } });
  }

  private finishCourier(c: Courier) {
    this.h.scene.remove(c.obj);
    c.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && m.geometry !== this.vanGeo && m.geometry !== this.truckGeo) m.geometry.dispose(); });
    this.couriers = this.couriers.filter((x) => x !== c);
  }

  private tickCouriers(dt: number) {
    for (const c of [...this.couriers]) {
      c.d += c.speed * dt;
      if (c.d >= c.total) { c.onArrive?.(); this.finishCourier(c); continue; }
      let i = 1;
      while (i < c.lens.length - 1 && c.lens[i] < c.d) i++;
      const a = c.path[i - 1], b = c.path[i];
      const k = (c.d - c.lens[i - 1]) / Math.max(0.0001, c.lens[i] - c.lens[i - 1]);
      c.obj.position.lerpVectors(a, b, k);
      c.obj.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      if (c.fadeOut) c.obj.scale.setScalar(1.25 * Math.min(1, (c.total - c.d) / 12 + 0.05));
    }
  }

  // ─── Beams, pings, fireworks ───────────────────────────────────────────────

  /** Claude finished: an orange beam from the runner to the building that got the result. */
  beam(toId: string) {
    const a = this.h.posOf("runner"), b = this.h.posOf(toId);
    if (!a || !b) return;
    const from = a.clone().setY(this.h.topOf("runner") - 1), to = b.clone().setY(Math.max(4, this.h.topOf(toId) - 1));
    const len = from.distanceTo(to);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a6b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8, 1, true), mat);
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd2b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const g = new THREE.Group(); g.add(beam, orb);
    this.addFx(g, 1.8, (k) => {
      mat.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.85;
      orb.position.lerpVectors(from, to, ease(Math.min(1, k * 1.4)));
      (orb.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  /** A hot gig: a green ring ripples out from the radar. */
  ping() {
    const p = this.h.posOf("radar"); if (!p) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), mat);
    ring.rotation.x = -Math.PI / 2; ring.position.copy(p).setY(0.2);
    this.addFx(ring, 2.2, (k) => { ring.scale.setScalar(1 + k * 15); mat.opacity = 0.9 * (1 - k); });
  }

  /** Three bursts above a spot — a goal just completed. */
  fireworks(at: THREE.Vector3) {
    for (let burst = 0; burst < 3; burst++) setTimeout(() => this.burst(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 16 + Math.random() * 6, (Math.random() - 0.5) * 8))), burst * 450);
  }

  private burst(at: THREE.Vector3) {
    const n = this.h.quality === "high" ? 160 : 80;
    const pos = new Float32Array(n * 3), vel: THREE.Vector3[] = [], col = new Float32Array(n * 3);
    const hue = Math.random();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      vel.push(new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 5));
      c.setHSL((hue + Math.random() * 0.12) % 1, 1, 0.62); col.set([c.r, c.g, c.b], i * 3);
      pos.set([at.x, at.y, at.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.addFx(pts, 2.4, (k, dt) => {
      for (let i = 0; i < n; i++) {
        vel[i].y -= 9 * dt; vel[i].multiplyScalar(1 - dt * 0.9);
        pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k * k;
    });
  }

  private addFx(obj: THREE.Object3D, life: number, update: Fx["update"]) {
    this.h.scene.add(obj);
    this.fx.push({ obj, t: 0, life, update });
  }

  private tickFx(dt: number) {
    for (const f of [...this.fx]) {
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.update(k, dt);
      if (k >= 1) {
        this.h.scene.remove(f.obj);
        f.obj.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
        this.fx = this.fx.filter((x) => x !== f);
      }
    }
  }

  // ─── Opportunity airships ──────────────────────────────────────────────────

  private static SHIP_COLORS: Record<string, number> = { hackathon: 0x3a86ff, jam: 0x8b5cf6, grant: 0xf4a300 };

  setAirships(list: Airship[]) {
    const keep = new Set(list.map((a) => a.id));
    for (const [id, s] of this.ships) if (!keep.has(id) && s.landing < 0) this.removeShip(id);
    list.forEach((a, i) => {
      if (this.ships.has(a.id)) return;
      const ang = (i / Math.max(4, list.length)) * Math.PI * 2 + 0.6;
      const slot = new THREE.Vector3(Math.cos(ang) * 11, 21 + (i % 2) * 3.5, Math.sin(ang) * 11);
      const g = new THREE.Group();
      const color = CityLife.SHIP_COLORS[a.kind] ?? 0x3a86ff;
      const env = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshLambertMaterial({ color }));
      env.scale.set(3.4, 1.15, 1.15); g.add(env);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.35, 20, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      stripe.rotation.z = Math.PI / 2; stripe.position.x = 0.6; g.add(stripe);
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0x2c3138 }));
      gondola.position.y = -1.35; g.add(gondola);
      for (const [y, z, rz] of [[0.8, 0, 0], [-0.8, 0, 0], [0, 0.8, Math.PI / 2], [0, -0.8, Math.PI / 2]]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.7), new THREE.MeshLambertMaterial({ color }));
        fin.position.set(-3, y, z); fin.rotation.x = rz; g.add(fin);
      }
      const days = a.deadline ? Math.ceil((new Date(a.deadline).getTime() - Date.now()) / 86_400_000) : null;
      const label = textSprite(a.title, `${a.kind === "jam" ? "Game jam" : a.kind === "grant" ? "Grant" : "Hackathon"}${days != null ? ` · ${days}d left` : ""} · tap to add`, `#${color.toString(16).padStart(6, "0")}`);
      label.position.y = 2.9;
      g.add(label);
      g.traverse((o) => { o.userData.airshipId = a.id; });
      g.position.copy(slot).setLength(140).setY(48);
      this.h.scene.add(g);
      this.pickables.push(g);
      this.ships.set(a.id, { data: a, group: g, slot, t: 0, landing: -1, label });
    });
  }

  /** Tapped → it descends onto the town hall (HQ) and is gone. */
  landAirship(id: number) {
    const s = this.ships.get(id);
    if (s && s.landing < 0) s.landing = 0;
  }

  private removeShip(id: number) {
    const s = this.ships.get(id); if (!s) return;
    this.h.scene.remove(s.group);
    s.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.MeshBasicMaterial | undefined; mat?.map?.dispose(); mat?.dispose(); });
    this.pickables = this.pickables.filter((p) => p !== s.group);
    this.ships.delete(id);
  }

  private tickShips(dt: number, t: number) {
    for (const s of this.ships.values()) {
      s.t += dt;
      if (s.landing >= 0) {
        s.landing += dt / 2.2;
        const k = ease(Math.min(1, s.landing));
        s.group.position.lerp(new THREE.Vector3(0, this.h.topOf("hq") + 1, 0), k * 0.12 + 0.02);
        s.group.scale.setScalar(Math.max(0.05, 1 - k * 0.9));
        if (s.landing >= 1) { this.removeShip(s.data.id); this.burst(new THREE.Vector3(0, this.h.topOf("hq") + 3, 0)); }
        continue;
      }
      const arrive = ease(Math.min(1, s.t / 5));
      const bob = Math.sin(t * 0.8 + s.data.id) * 0.5;
      const drift = new THREE.Vector3(s.slot.x, s.slot.y + bob, s.slot.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.03);
      s.group.position.lerp(drift, arrive < 1 ? 0.02 + arrive * 0.03 : 0.05);
      const tangent = new THREE.Vector3(-drift.z, 0, drift.x);
      s.group.rotation.y = -Math.atan2(tangent.z, tangent.x);
    }
  }

  // ─── Construction sites (monthly goals) ────────────────────────────────────

  private siteTop(g: GoalSite) { return g.done ? 4 + 9 * 0.9 + 3 : 16; }

  /** Returns ids of goals that just turned complete (for fireworks). */
  setGoals(goals: GoalSite[]): number[] {
    const completed: number[] = [];
    const ids = new Set(goals.map((g) => g.id));
    for (const [id, s] of this.sites) if (!ids.has(id)) { this.h.scene.remove(s.group); this.h.setAnchor(`goal:${id}`, null, 0); this.sites.delete(id); }
    const spots: THREE.Vector3[] = [];
    goals.forEach((g, i) => {
      const prev = this.sites.get(g.id);
      if (prev && prev.data.progress === g.progress && prev.data.done === g.done) { spots.push(prev.pos); return; }
      if (prev && !prev.data.done && g.done) completed.push(g.id);
      if (prev) this.h.scene.remove(prev.group);
      const a = (i / Math.max(goals.length, 5)) * Math.PI * 2 + 0.35;
      const pos = new THREE.Vector3(Math.cos(a) * SITE_RADIUS, 0, Math.sin(a) * SITE_RADIUS);
      spots.push(pos);
      const { group, arm } = this.makeSite(g, i);
      group.position.copy(pos);
      group.rotation.y = -a + Math.PI / 2;
      group.traverse((o) => { o.userData.goalId = g.id; });
      this.h.scene.add(group);
      this.sites.set(g.id, { data: g, group, arm, pos });
      this.h.setAnchor(`goal:${g.id}`, group, this.siteTop(g));
    });
    this.h.clearTreesNear(spots, 7.5);
    return completed;
  }

  private makeSite(g: GoalSite, seed: number) {
    const grp = new THREE.Group();
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(5, 28), new THREE.MeshLambertMaterial({ color: g.done ? 0xc9c3b4 : 0xa98a62 }));
    dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.03; dirt.receiveShadow = true; grp.add(dirt);
    const h = 1 + 9 * Math.min(1, g.progress) * 0.9;
    let arm: THREE.Object3D | null = null;
    if (g.done) {
      const palette = [0xe76f51, 0x2a9d8f, 0x457b9d, 0xe9c46a, 0x8b5cf6, 0xef476f];
      const body = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), new THREE.MeshLambertMaterial({ color: 0xf1ece2 }));
      body.position.y = h / 2; body.castShadow = true; grp.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 4), new THREE.MeshLambertMaterial({ color: palette[seed % palette.length] }));
      roof.rotation.y = Math.PI / 4; roof.position.y = h + 1.2; roof.castShadow = true; grp.add(roof);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), this.mats.pole); pole.position.y = h + 3.2; grp.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshLambertMaterial({ color: palette[(seed + 2) % palette.length], side: THREE.DoubleSide }));
      flag.position.set(0.6, h + 4, 0); grp.add(flag);
    } else {
      // Fence
      const fenceMat = new THREE.MeshLambertMaterial({ color: 0xf2b134 });
      for (const y of [0.45, 0.85]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.05, 4, 40), fenceMat); rail.rotation.x = Math.PI / 2; rail.position.y = y; grp.add(rail); }
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 0.12), fenceMat, 18);
      const o = new THREE.Object3D();
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; o.position.set(Math.cos(a) * 4.6, 0.5, Math.sin(a) * 4.6); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); }
      grp.add(posts);
      // The part that's built so far (rises with progress)
      const core = new THREE.Mesh(new THREE.BoxGeometry(3.6, h, 3.6), new THREE.MeshLambertMaterial({ color: 0xb9b3a8 }));
      core.position.y = h / 2; core.castShadow = true; grp.add(core);
      // Scaffolding to the full height
      const scaffold = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.2, 10, 4.2, 1, 4, 1)), new THREE.LineBasicMaterial({ color: 0xd8892b }));
      scaffold.position.y = 5; grp.add(scaffold);
      // Crane
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.4, 14, 0.4), new THREE.MeshLambertMaterial({ color: 0xf2b134 }));
      tower.position.set(3.4, 7, -3.4); grp.add(tower);
      const pivot = new THREE.Group(); pivot.position.set(3.4, 14, -3.4);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(10, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0xf2b134 }));
      jib.position.x = -3; pivot.add(jib);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 4), this.mats.pole); cable.position.set(-6, -2, 0); pivot.add(cable);
      const load = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0x8d99ae })); load.position.set(-6, -4.2, 0); pivot.add(load);
      grp.add(pivot);
      arm = pivot;
    }
    return { group: grp, arm };
  }

  sitePosition(goalId: number) { return this.sites.get(goalId)?.pos.clone() ?? null; }
  activeSites() { return [...this.sites.values()].filter((s) => !s.data.done).map((s) => s.pos); }

  // ─── Frame ─────────────────────────────────────────────────────────────────

  tick(dt: number, t: number, night: number) {
    this.tickWeather(dt, night);
    this.tickBulbs(dt, t);
    this.tickCouriers(dt);
    this.tickFx(dt);
    this.tickShips(dt, t);
    for (const s of this.sites.values()) if (s.arm) s.arm.rotation.y = Math.sin(t * 0.25 + s.data.id) * 1.2;
    if (this.runnerGlow) {
      const m = this.runnerGlow.material as THREE.MeshBasicMaterial;
      m.opacity += ((this.runnerWorking ? 0.16 + Math.sin(t * 3) * 0.08 : 0) - m.opacity) * 0.06;
      this.runnerGlow.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    }
    if (this.sweep) {
      const m = this.sweep.material as THREE.MeshBasicMaterial;
      m.opacity += ((this.scanning ? 0.22 : 0) - m.opacity) * 0.05;
      this.sweep.rotation.z += dt * (this.scanning ? 2.2 : 0.4);
    }
  }
}

/** Grass between the building plots (the band between the two ring roads). */
function PLOT_GAP() { return RING_INNER + 3 + Math.random() * (RING_OUTER - RING_INNER - 6); }
