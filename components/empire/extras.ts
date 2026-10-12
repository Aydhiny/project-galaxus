// More life for the city, all from real data:
//  • constellations — one per skill, a star per level; a full one (LV 12) connects and glows
//  • seasons — snow in winter, falling leaves in autumn, petals in spring (from the real date)
//  • Ramadan — lanterns around the plaza and the mosque (Islamic calendar)
//  • habit citizens — each routine walks the city with its name; 7-day streak = hat,
//    14 = drives a car, 30 = gets a house; a missed routine sits on a bench

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Citizen, Season } from "@/lib/empire-world";
import { RING_INNER, RING_OUTER, textSprite } from "./life";

type Host = { scene: THREE.Scene; quality: "low" | "high"; posOf: (id: string) => THREE.Vector3 | null };
type Walker = { data: Citizen; group: THREE.Group; angle: number; speed: number; mode: "walk" | "drive" | "bench" };

const SKY_R = 120; // just beyond the trees — the default camera looks down, so a high sky would be off screen
const FULL_LEVEL = 12;
const SHIRTS = [0x2a9d8f, 0xe76f51, 0x457b9d, 0xe9c46a, 0x6d597a, 0xf4a261, 0x264653, 0xef476f];

/** A stable pseudo-random star pattern per skill (same shape every visit). */
function pattern(seed: number, count: number) {
  let s = seed * 9973 + 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: [number, number][] = [];
  let x = 0, y = 0;
  for (let i = 0; i < count; i++) { x += (rnd() - 0.4) * 4.5; y += (rnd() - 0.45) * 2.6; pts.push([x, y]); }
  return pts;
}

export class CityExtras {
  private skyGroup = new THREE.Group();
  private skyMats: (THREE.PointsMaterial | THREE.LineBasicMaterial | THREE.SpriteMaterial)[] = [];
  private skyKey = "";
  private particles: { mesh: THREE.InstancedMesh; state: { p: THREE.Vector3; v: number; spin: number; phase: number }[]; kind: Season["kind"] } | null = null;
  private seasonKey = "";
  private lanterns: THREE.Group | null = null;
  private lanternMat = new THREE.MeshBasicMaterial({ color: 0xffc14d });
  private walkers: Walker[] = [];
  private houses = new THREE.Group();
  private citizenKey = "";
  private bodyGeo: THREE.BufferGeometry;
  private carGeo: THREE.BufferGeometry;

  constructor(private h: Host) {
    h.scene.add(this.skyGroup, this.houses);
    const torso = new THREE.CylinderGeometry(0.28, 0.34, 0.95, 8); torso.translate(0, 0.7, 0);
    const head = new THREE.SphereGeometry(0.26, 10, 8); head.translate(0, 1.42, 0);
    this.bodyGeo = mergeGeometries([torso, head]);
    const body = new THREE.BoxGeometry(2, 0.6, 1); body.translate(0, 0.5, 0);
    const cabin = new THREE.BoxGeometry(1, 0.45, 0.85); cabin.translate(-0.1, 1, 0);
    this.carGeo = mergeGeometries([body, cabin]);
  }

  // ─── Constellations ────────────────────────────────────────────────────────

  setSky(skills: { key: string; label: string; level: number }[]) {
    const key = skills.map((s) => `${s.key}:${Math.min(FULL_LEVEL, s.level)}`).join("|");
    if (key === this.skyKey) return;
    this.skyKey = key;
    this.skyGroup.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
    this.skyGroup.clear();
    this.skyMats = [];
    skills.forEach((s, i) => {
      const lit = Math.min(FULL_LEVEL, Math.max(1, s.level));
      const full = s.level >= FULL_LEVEL;
      const az = (i / skills.length) * Math.PI * 2 + 0.4;
      const el = 0.1 + (i % 2) * 0.05;
      const center = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(SKY_R);
      // A little plane facing the city, so the 2D pattern sits on the sky dome.
      const basisZ = center.clone().normalize().negate();
      const basisX = new THREE.Vector3(0, 1, 0).cross(basisZ).normalize();
      const basisY = basisZ.clone().cross(basisX).normalize();
      const pts = pattern(i + s.key.length * 7, FULL_LEVEL).map(([x, y]) => center.clone().addScaledVector(basisX, x).addScaledVector(basisY, y));
      const all = new THREE.BufferGeometry().setFromPoints(pts);
      const dimMat = new THREE.PointsMaterial({ color: 0x8090b0, size: 3.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
      const litMat = new THREE.PointsMaterial({ color: full ? 0xffe39a : 0xffffff, size: full ? 9 : 6.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
      this.skyGroup.add(new THREE.Points(all, dimMat), new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts.slice(0, lit)), litMat));
      const lineMat = new THREE.LineBasicMaterial({ color: full ? 0xffd27a : 0x9fb3ff, transparent: true, opacity: 0, fog: false });
      if (lit > 1) this.skyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.slice(0, lit)), lineMat));
      const label = textSprite(`${s.label}`, full ? "Complete constellation ✦" : `LV ${s.level} · ${lit}/${FULL_LEVEL} stars`, full ? "#ffd27a" : "#9fb3ff");
      label.position.copy(pts[0]).addScaledVector(basisY, 6);
      label.scale.multiplyScalar(2.2);
      (label.material as THREE.SpriteMaterial).fog = false;
      this.skyGroup.add(label);
      dimMat.userData.base = 0.5; litMat.userData.base = 1; lineMat.userData.base = full ? 0.9 : 0.35; (label.material as THREE.SpriteMaterial).userData.base = 0.85;
      this.skyMats.push(dimMat, litMat, lineMat, label.material as THREE.SpriteMaterial);
    });
  }

  // ─── Seasons + Ramadan ─────────────────────────────────────────────────────

  setSeason(season: Season, crowns: THREE.InstancedMesh | null, ground: THREE.MeshLambertMaterial) {
    const key = `${season.kind}:${season.ramadan}:${season.eid}`;
    if (key === this.seasonKey) return;
    this.seasonKey = key;
    // Tree colours
    if (crowns) {
      (crowns.material as THREE.MeshLambertMaterial).color.set(0xffffff); // let the per-tree colours show as-is
      const c = new THREE.Color();
      for (let i = 0; i < crowns.count; i++) {
        const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        const k = Math.abs(r);
        if (season.kind === "autumn") c.setHSL(0.02 + k * 0.1, 0.75, 0.42 + k * 0.1);
        else if (season.kind === "winter") c.setHSL(0.55, 0.12, 0.82 + k * 0.1);
        else if (season.kind === "spring") c.setHSL(k < 0.2 ? 0.92 : 0.3, k < 0.2 ? 0.55 : 0.5, k < 0.2 ? 0.78 : 0.38);
        else c.setHSL(0.28 + k * 0.08, 0.45, 0.32 + k * 0.12);
        crowns.setColorAt(i, c);
      }
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    }
    ground.userData.season = season.kind; // the engine tints the grass in winter
    // Falling particles
    if (this.particles) { this.h.scene.remove(this.particles.mesh); this.particles.mesh.geometry.dispose(); this.particles = null; }
    if (season.kind !== "summer") {
      const count = this.h.quality === "high" ? (season.kind === "winter" ? 900 : 260) : (season.kind === "winter" ? 400 : 120);
      const geo = season.kind === "winter" ? new THREE.SphereGeometry(0.12, 5, 4) : new THREE.PlaneGeometry(0.42, 0.28);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const col = new THREE.Color();
      const state = Array.from({ length: count }, (_, i) => {
        if (season.kind === "autumn") mesh.setColorAt(i, col.setHSL(0.03 + Math.random() * 0.09, 0.8, 0.5));
        else if (season.kind === "spring") mesh.setColorAt(i, col.setHSL(0.93, 0.6, 0.85));
        else mesh.setColorAt(i, col.setHex(0xffffff));
        return { p: this.spawn(Math.random() * 40), v: season.kind === "winter" ? 2 + Math.random() * 1.5 : 1.4 + Math.random(), spin: Math.random() * 3, phase: Math.random() * 6 };
      });
      mesh.frustumCulled = false;
      this.h.scene.add(mesh);
      this.particles = { mesh, state, kind: season.kind };
    }
    // Ramadan lanterns
    if (this.lanterns) { this.h.scene.remove(this.lanterns); this.lanterns = null; }
    if (season.ramadan) this.buildLanterns();
  }

  private spawn(y: number) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 60;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  private buildLanterns() {
    const g = new THREE.Group();
    const lantern = new THREE.CylinderGeometry(0.28, 0.22, 0.6, 6);
    const cap = new THREE.ConeGeometry(0.3, 0.25, 6); cap.translate(0, 0.42, 0);
    const geo = mergeGeometries([lantern, cap]);
    const ring = RING_INNER - 1.2;
    const n = 36;
    const mesh = new THREE.InstancedMesh(geo, this.lanternMat, n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.position.set(Math.cos(a) * ring, 3.2 + Math.sin(i * 1.7) * 0.3, Math.sin(a) * ring); o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    g.add(mesh);
    // A string between them
    const pts = Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * ring, 3.75, Math.sin(a) * ring); });
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5a4a3a })));
    const mosque = this.h.posOf("mosque");
    if (mosque) {
      const light = new THREE.PointLight(0xffc14d, 40, 26, 1.8);
      light.position.copy(mosque).setY(6);
      g.add(light);
      const crescent = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.18, 8, 24, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      crescent.position.copy(mosque).setY(14); crescent.rotation.z = 0.6;
      g.add(crescent);
    }
    this.lanterns = g;
    this.h.scene.add(g);
  }

  // ─── Habit citizens ────────────────────────────────────────────────────────

  setCitizens(list: Citizen[]) {
    const key = list.map((c) => `${c.id}:${c.streak}:${c.sad}:${c.doneToday}:${c.name}`).join("|");
    if (key === this.citizenKey) return;
    this.citizenKey = key;
    for (const w of this.walkers) this.h.scene.remove(w.group);
    this.walkers = [];
    this.houses.clear();
    list.forEach((c, i) => {
      const g = new THREE.Group();
      const mode: Walker["mode"] = c.sad ? "bench" : c.streak >= 14 ? "drive" : "walk";
      const shirt = c.sad ? 0x7d828a : SHIRTS[i % SHIRTS.length];
      if (mode === "drive") {
        const car = new THREE.Mesh(this.carGeo, new THREE.MeshLambertMaterial({ color: shirt }));
        car.castShadow = this.h.quality === "high";
        g.add(car);
      } else {
        const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshLambertMaterial({ color: shirt }));
        body.castShadow = this.h.quality === "high";
        if (mode === "bench") { body.scale.set(1, 0.72, 1); body.rotation.x = 0.35; } // slumped
        g.add(body);
        if (c.streak >= 7) {
          const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0x1f2937 }));
          hat.position.y = 1.85; g.add(hat);
        }
        if (mode === "bench") {
          const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
          bench.position.set(0, 0.45, 0.1); g.add(bench);
        }
      }
      const sub = c.sad ? "missed yesterday" : c.streak >= 30 ? `${c.streak}-day streak · has a house` : c.streak >= 14 ? `${c.streak}-day streak · drives` : c.streak >= 7 ? `${c.streak}-day streak · hat` : c.streak > 0 ? `${c.streak}-day streak` : "start today";
      const label = textSprite(c.name, sub, c.sad ? "#9ca3af" : c.doneToday ? "#34d399" : "#fbbf24");
      label.scale.multiplyScalar(0.55);
      label.position.y = mode === "drive" ? 2.6 : 2.7;
      g.add(label);
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2 + 0.2;
      if (mode === "bench") g.position.set(Math.cos(angle) * (RING_INNER - 3.3), 0, Math.sin(angle) * (RING_INNER - 3.3));
      this.h.scene.add(g);
      this.walkers.push({ data: c, group: g, angle, speed: (mode === "drive" ? 0.08 : 0.035) * (i % 2 ? 1 : -1), mode });
      // 30-day streak: a house of their own on the edge of town
      if (c.streak >= 30) {
        const hg = new THREE.Group();
        const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.4), new THREE.MeshLambertMaterial({ color: 0xf3ead9 }));
        hb.position.y = 1; hb.castShadow = true; hg.add(hb);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.4, 4), new THREE.MeshLambertMaterial({ color: shirt }));
        roof.rotation.y = Math.PI / 4; roof.position.y = 2.7; hg.add(roof);
        const hl = textSprite(c.name, `${c.streak} days`, "#34d399"); hl.scale.multiplyScalar(0.5); hl.position.y = 4.4; hg.add(hl);
        const ha = angle + Math.PI / list.length;
        hg.position.set(Math.cos(ha) * (RING_OUTER + 5.5), 0, Math.sin(ha) * (RING_OUTER + 5.5));
        hg.rotation.y = -ha - Math.PI / 2;
        this.houses.add(hg);
      }
    });
  }

  // ─── Frame ─────────────────────────────────────────────────────────────────

  tick(dt: number, t: number, night: number) {
    // Constellations fade in after dusk.
    const vis = Math.max(0, night - 0.35) * 1.6;
    for (const m of this.skyMats) m.opacity = Math.min(1, vis) * (m.userData.base ?? 1);
    this.skyGroup.visible = vis > 0.01;

    if (this.particles) {
      const { mesh, state, kind } = this.particles;
      const o = new THREE.Object3D();
      state.forEach((s, i) => {
        s.p.y -= s.v * dt;
        if (kind !== "winter") { s.p.x += Math.sin(t * 0.9 + s.phase) * dt * 1.2; s.p.z += Math.cos(t * 0.7 + s.phase) * dt * 0.8; }
        else s.p.x += Math.sin(t + s.phase) * dt * 0.3;
        if (s.p.y < 0.05) s.p.copy(this.spawn(30 + Math.random() * 10));
        o.position.copy(s.p);
        o.rotation.set(t * s.spin, t * s.spin * 0.7, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.lanterns) this.lanternMat.color.setHSL(0.11, 1, 0.55 + Math.sin(t * 2) * 0.06 + night * 0.1);

    for (const w of this.walkers) {
      if (w.mode === "bench") continue;
      w.angle += w.speed * dt;
      const r = w.mode === "drive" ? RING_OUTER - 0.9 * Math.sign(w.speed) : RING_INNER + 3.1;
      w.group.position.set(Math.cos(w.angle) * r, w.mode === "walk" ? Math.abs(Math.sin(t * 7 + w.data.id)) * 0.08 : 0, Math.sin(w.angle) * r);
      w.group.rotation.y = -w.angle + (w.speed > 0 ? -Math.PI / 2 : Math.PI / 2) + (w.mode === "drive" ? 0 : Math.PI / 2);
    }
  }
}
