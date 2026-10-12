// The empire city — plain three.js, everything procedural (no model files):
// a circular city around your HQ, a building per Galaxus system, ring roads
// with traffic, trees, street lamps, smoke, a spinning radar dish, blinking
// beacons, and a real day/night cycle from your clock.
//
// Built to run on any PC:
//  • instancing for cars / trees / lamps (a handful of draw calls)
//  • shared geometries + materials, canvas textures made once
//  • auto quality: starts high on strong machines, drops shadows / pixel
//    ratio / traffic if the frame rate dips
//  • the loop stops completely when paused (another page is open) or the tab is hidden

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Building, World, WorldEvent } from "@/lib/client/empire";
import { CityLife } from "./life";
import { logoTexture } from "./logo-texture";
import { siClaude, siDiscord, siGmail, siReddit, siRss, siStripe, siUnity, siWhatsapp, siYoutube } from "simple-icons";

/** Real brand logos above the buildings that use those services. */
const LOGOS: Record<string, { path: string; hex: string }> = {
  radar: siReddit, autopilot: siGmail, outreach: siWhatsapp, vault: siStripe, news: siRss,
  runner: siClaude, community: siDiscord, studio: siUnity, youtube: siYoutube,
};

export type Mood = "normal" | "disco" | "hibernate";
export type SoundMix = { key: "construction" | "factory" | "vault" | "mosque"; gain: number; pan: number }[];

/** Which building a payment drives out of, by income source. */
const MONEY_FROM: Record<string, string> = { client: "outreach", retainer: "outreach", gig: "radar", beat: "studio", stripe: "hq", other: "hq" };

type Quality = "low" | "high";
type Anchor = { id: string; obj: THREE.Object3D; top: number };

const PALETTE = {
  ground: 0x9fc39a, groundNight: 0x24342c, road: 0x3c4148, line: 0xf2f2ef, plaza: 0xd9d4c7,
  wall: 0xe9e4da, glass: 0x7fa7c9, roof: 0xb4553f, gold: 0xe0b44c, dark: 0x2c3138, green: 0x3f8f5a, white: 0xf7f5f0,
};
const CAR_COLORS = [0xe63946, 0xf1c453, 0x2a9d8f, 0x457b9d, 0xf4a261, 0xffffff, 0x1d3557, 0x8d99ae, 0x6a4c93];

const RING_INNER = 13;
const RING_OUTER = 31;
const PLOT_RADIUS = 22;
const HOME_DIR = new THREE.Vector3(46, 40, 52).normalize(); // the default camera angle

/** A canvas "windows" texture — lit windows glow at night / when the building is busy. */
function windowTexture(lit: number, seed: number) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, 64, 128);
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let y = 6; y < 124; y += 12) for (let x = 6; x < 60; x += 12) {
    if (rnd() < lit) { g.fillStyle = rnd() < 0.15 ? "#ffd58a" : "#ffeab8"; g.fillRect(x, y, 7, 7); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class EmpireEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private quality: Quality;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xdfefff, 0x6a7d5c, 1.1);
  private groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  private life!: CityLife;
  private trees: { trunks: THREE.InstancedMesh; crowns: THREE.InstancedMesh; spots: THREE.Vector3[] } | null = null;
  private radarSpin: { obj: THREE.Object3D; speed: number; axis: "y" | "z" } | null = null;
  private workingIds = new Set<string>();
  private lastSound = 0;
  private buildingsGroup = new THREE.Group();
  private anchors: Anchor[] = [];
  private pickables: THREE.Object3D[] = [];
  private spinners: { obj: THREE.Object3D; speed: number; axis: "y" | "z" }[] = [];
  private beacons: THREE.Mesh[] = [];
  private smoke: { mesh: THREE.InstancedMesh; base: THREE.Vector3; t: Float32Array; active: boolean }[] = [];
  private windowMats: THREE.MeshLambertMaterial[] = [];
  private cars!: THREE.InstancedMesh;
  private lights!: THREE.InstancedMesh;
  private carState: { ring: number; angle: number; speed: number }[] = [];
  private lamps!: THREE.InstancedMesh;
  private hovered: THREE.Object3D | null = null;
  private down = { x: 0, y: 0, t: 0 };
  private frameTimes: number[] = [];
  private night = 0;
  private timeOverride: number | null = null; // hour of day, or null = follow your clock
  private stars!: THREE.Points;
  private mood: Mood = "normal";
  private interacting = false;
  private lastInteraction = 0;
  private focusGoal = new THREE.Vector3(0, 3, 0); // where the camera orbits; eased toward each frame
  private focused = false;
  private homeDist = 80; // camera distance that fits the whole city in the current aspect ratio
  private resizeObs: ResizeObserver | null = null;
  private discoLights: THREE.PointLight[] = [];
  private prayerGlow: THREE.Mesh | null = null;
  private prayer = false;
  private logos: THREE.Sprite[] = [];
  private workers!: THREE.InstancedMesh;
  private packages!: THREE.InstancedMesh;
  private workerState: { from: number; to: number; t: number; speed: number; carry: boolean }[] = [];
  private plots: { pos: THREE.Vector3; active: boolean; working: boolean }[] = [];
  private crew: number[] = []; // plot indexes workers walk between (HQ + buildings running an automation)
  private crewSize = 0;
  private labelEls = new Map<string, HTMLElement>();
  private tmp = new THREE.Object3D();
  private v = new THREE.Vector3();
  onPick: (id: string) => void = () => {};
  onPickAirship: (id: number) => void = () => {};
  onSound: ((mix: SoundMix) => void) | null = null;
  onHover: (id: string | null) => void = () => {};

  constructor(private host: HTMLElement) {
    const strong = (navigator.hardwareConcurrency ?? 4) >= 8 && !/Mobi|Android/i.test(navigator.userAgent);
    this.quality = strong ? "high" : "low";
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality === "high", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === "high" ? 1.75 : 1));
    this.renderer.shadowMap.enabled = this.quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.camera.position.set(46, 40, 52);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 22;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.target.set(0, 3, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    // Interacting pauses the slow auto-rotate; it resumes after a few idle seconds
    // (a click used to switch it off for good).
    this.controls.addEventListener("start", () => { this.interacting = true; this.lastInteraction = performance.now(); });
    this.controls.addEventListener("end", () => { this.interacting = false; this.lastInteraction = performance.now(); });

    this.scene.fog = new THREE.Fog(0xcfe3ef, 90, 220);
    this.scene.add(this.hemi);
    this.sun.position.set(40, 60, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    this.buildWorld();
    this.life = new CityLife({
      scene: this.scene, quality: this.quality,
      posOf: (id) => { const a = this.anchors.find((x) => x.id === id); return a ? a.obj.getWorldPosition(new THREE.Vector3()) : null; },
      topOf: (id) => this.anchors.find((x) => x.id === id)?.top ?? 6,
      setAnchor: (id, obj, top) => {
        this.anchors = this.anchors.filter((x) => x.id !== id);
        if (obj) this.anchors.push({ id, obj, top });
        if (obj && !this.pickables.includes(obj)) this.pickables.push(obj);
      },
      clearTreesNear: (pts, r) => this.clearTreesNear(pts, r),
    });
    this.life.buildMeadow();
    this.scene.add(this.buildingsGroup);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    window.addEventListener("resize", this.resize);
    // The host also changes size without a window resize (sidebar, phone URL bar, rotation).
    this.resizeObs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObs?.observe(host);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  // ─── World ──────────────────────────────────────────────────────────────────

  private buildWorld() {
    const ground = new THREE.Mesh(CityLife.groundGeometry(), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Plaza around HQ, two ring roads with dashed centre lines, and four radial avenues.
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(RING_INNER - 2, 48), new THREE.MeshLambertMaterial({ color: PALETTE.plaza }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true;
    this.scene.add(plaza);
    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.line });
    for (const r of [RING_INNER, RING_OUTER]) {
      const road = new THREE.Mesh(new THREE.RingGeometry(r - 2, r + 2, 96), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.y = 0.03; road.receiveShadow = true;
      this.scene.add(road);
      const dashes: THREE.BufferGeometry[] = [];
      const count = Math.round((2 * Math.PI * r) / 3);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const d = new THREE.PlaneGeometry(1.2, 0.18);
        d.rotateX(-Math.PI / 2); d.rotateY(-a);
        d.translate(Math.cos(a) * r, 0.05, Math.sin(a) * r);
        dashes.push(d);
      }
      this.scene.add(new THREE.Mesh(mergeGeometries(dashes), lineMat));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const len = RING_OUTER - RING_INNER;
      const avenue = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), roadMat);
      avenue.rotation.x = -Math.PI / 2; avenue.rotation.z = -a;
      avenue.position.set(Math.cos(a) * (RING_INNER + len / 2), 0.035, Math.sin(a) * (RING_INNER + len / 2));
      avenue.receiveShadow = true;
      this.scene.add(avenue);
    }

    // Stars, visible as night falls.
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.45 + 0.05;
      const r = 180;
      starPos.set([Math.cos(u) * Math.cos(v * Math.PI) * r, Math.sin(v * Math.PI) * r * 0.9 + 10, Math.sin(u) * Math.cos(v * Math.PI) * r], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.stars);

    // Trees: instanced trunks + canopies scattered outside the city and between plots.
    const treeCount = this.quality === "high" ? 220 : 110;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x7a5434 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 2.6, 7), new THREE.MeshLambertMaterial({ color: PALETTE.green }), treeCount);
    crowns.castShadow = this.quality === "high";
    const col = new THREE.Color();
    const treeSpots: THREE.Vector3[] = [];
    for (let i = 0; i < treeCount; i++) {
      const outer = i % 3 !== 0;
      const r = outer ? RING_OUTER + 5 + Math.random() * 40 : PLOT_RADIUS + (Math.random() < 0.5 ? -5.5 : 5.5) + (Math.random() - 0.5) * 1.5;
      const a = Math.random() * Math.PI * 2;
      const s = 0.7 + Math.random() * 0.8;
      this.tmp.position.set(Math.cos(a) * r, 0.6 * s, Math.sin(a) * r); this.tmp.scale.setScalar(s); this.tmp.rotation.set(0, 0, 0); this.tmp.updateMatrix();
      treeSpots.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      trunks.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.y = 2.2 * s; this.tmp.updateMatrix();
      crowns.setMatrixAt(i, this.tmp.matrix);
      crowns.setColorAt(i, col.setHSL(0.28 + Math.random() * 0.08, 0.45, 0.32 + Math.random() * 0.12));
    }
    this.scene.add(trunks, crowns);
    this.trees = { trunks, crowns, spots: treeSpots };

    // Street lamps around both rings (bulbs glow at night).
    const lampSpots: THREE.Vector3[] = [];
    for (const r of [RING_INNER + 2.6, RING_OUTER + 2.6]) {
      const k = Math.round((2 * Math.PI * r) / 9);
      for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; lampSpots.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 5), new THREE.MeshLambertMaterial({ color: PALETTE.dark }), lampSpots.length);
    this.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), lampSpots.length);
    lampSpots.forEach((p, i) => {
      this.tmp.position.set(p.x, 1.5, p.z); this.tmp.scale.setScalar(1); this.tmp.updateMatrix(); poles.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.y = 3.05; this.tmp.updateMatrix(); this.lamps.setMatrixAt(i, this.tmp.matrix);
    });
    this.scene.add(poles, this.lamps);

    // Cars: one merged low-poly body, instanced, + headlights that follow.
    const body = new THREE.BoxGeometry(1.8, 0.55, 0.9); body.translate(0, 0.45, 0);
    const cabin = new THREE.BoxGeometry(0.95, 0.42, 0.8); cabin.translate(-0.1, 0.92, 0);
    const carGeo = mergeGeometries([body, cabin]);
    const carCount = this.quality === "high" ? 44 : 22;
    this.cars = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), carCount);
    this.cars.castShadow = this.quality === "high";
    this.lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.14, 0.7), new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0 }), carCount);
    for (let i = 0; i < carCount; i++) {
      const ring = i % 2;
      this.carState.push({ ring, angle: Math.random() * Math.PI * 2, speed: (0.06 + Math.random() * 0.05) * (ring ? 0.6 : 1) * (i % 4 < 2 ? 1 : -1) });
      this.cars.setColorAt(i, col.setHex(CAR_COLORS[i % CAR_COLORS.length]));
    }
    this.scene.add(this.cars, this.lights);

    // Workers: tiny people walking between buildings (body + head merged, instanced).
    const torso = new THREE.CylinderGeometry(0.22, 0.28, 0.75, 6); torso.translate(0, 0.55, 0);
    const head = new THREE.SphereGeometry(0.2, 8, 6); head.translate(0, 1.1, 0);
    const workerCount = this.quality === "high" ? 36 : 16;
    this.workers = new THREE.InstancedMesh(mergeGeometries([torso, head]), new THREE.MeshLambertMaterial({ color: 0xffffff }), workerCount);
    this.packages = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), new THREE.MeshLambertMaterial({ color: 0xc8955a }), workerCount);
    const shirts = [0x2a9d8f, 0xe76f51, 0x264653, 0xe9c46a, 0x6d597a, 0x457b9d, 0xf4a261];
    for (let i = 0; i < workerCount; i++) {
      this.workers.setColorAt(i, col.setHex(shirts[i % shirts.length]));
      this.workerState.push({ from: 0, to: 0, t: Math.random(), speed: 0.05 + Math.random() * 0.04, carry: false });
    }
    this.scene.add(this.workers, this.packages);

    // Disco: three coloured lights that sweep the plaza (off unless disco mode).
    for (const c of [0xff2d95, 0x00e5ff, 0xb8ff00]) {
      const l = new THREE.PointLight(c, 0, 60, 1.6);
      l.position.set(0, 12, 0);
      this.discoLights.push(l);
      this.scene.add(l);
    }
  }

  // ─── Buildings (rebuilt when data changes shape) ───────────────────────────

  private mat(color: number) { return new THREE.MeshLambertMaterial({ color }); }

  private box(w: number, h: number, d: number, color: number, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  private windowsBox(w: number, h: number, d: number, color: number, active: boolean, seed: number) {
    const tex = windowTexture(active ? 0.7 : 0.35, seed);
    tex.repeat.set(Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 4.5)));
    const side = new THREE.MeshLambertMaterial({ color, emissive: 0xffd590, emissiveMap: tex, emissiveIntensity: 0 });
    side.userData.active = active;
    this.windowMats.push(side);
    const top = this.mat(color);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
    m.position.y = h / 2; m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  private makeBuilding(b: Building, seed: number): { group: THREE.Group; top: number } {
    const g = new THREE.Group();
    const lv = Math.min(12, Math.max(1, b.level));
    const grow = 1 + (lv - 1) * 0.16;
    let top = 6;
    const beacon = (y: number) => {
      const bc = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
      bc.position.y = y; g.add(bc); this.beacons.push(bc);
    };
    switch (b.kind) {
      case "castle": {
        const h = 7 * grow;
        g.add(this.windowsBox(6, h, 6, 0xd8d0c0, true, seed));
        for (const [x, z] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, h + 2.5, 10), this.mat(0xcfc6b4));
          t.position.set(x, (h + 2.5) / 2, z); t.castShadow = true; g.add(t);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 10), this.mat(0x2f5d9e));
          cone.position.set(x, h + 3.7, z); cone.castShadow = true; g.add(cone);
        }
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 5), this.mat(PALETTE.dark));
        flagPole.position.y = h + 1.5; g.add(flagPole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: 0x14b8a6, side: THREE.DoubleSide }));
        flag.position.set(0.8, h + 2.4, 0); g.add(flag); this.spinners.push({ obj: flag, speed: 0, axis: "y" });
        top = h + 5.5;
        break;
      }
      case "tower": {
        const h = 9 * grow;
        g.add(this.windowsBox(3.2, h, 3.2, 0xdfe6ee, b.active, seed));
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.5, 6), this.mat(PALETTE.dark));
        mast.position.y = h + 1.75; g.add(mast);
        const dish = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshLambertMaterial({ color: PALETTE.white, side: THREE.DoubleSide }));
        bowl.rotation.x = Math.PI / 2.4; dish.add(bowl);
        dish.position.y = h + 2.6; g.add(dish);
        const spin = { obj: dish, speed: b.active ? 1.2 : 0.15, axis: "y" as const };
        this.spinners.push(spin);
        if (b.id === "radar") this.radarSpin = spin;
        beacon(h + 3.6);
        top = h + 4.5;
        break;
      }
      case "office": {
        const h = 8 * grow;
        g.add(this.windowsBox(4.5, h, 4, PALETTE.glass, b.active, seed));
        g.add(Object.assign(this.box(5, 0.4, 4.5, PALETTE.dark, h), {}));
        top = h + 1.5;
        break;
      }
      case "bank": {
        const h = 4.5 * grow;
        g.add(this.box(7, 0.6, 5.5, PALETTE.wall));
        g.add(this.windowsBox(6, h, 4.4, PALETTE.wall, b.active, seed).translateY(0.6));
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, h, 10), this.mat(PALETTE.white));
          c.position.set(-2.4 + i * 1.2, h / 2 + 0.6, 2.6); c.castShadow = true; g.add(c);
        }
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 4.4, 1.6, 4, 1), this.mat(PALETTE.gold));
        roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); roof.position.y = h + 1.4; roof.castShadow = true; g.add(roof);
        top = h + 3;
        break;
      }
      case "vault": {
        const h = 3.5 * grow;
        g.add(this.box(5.5, h, 5.5, 0x8a929c));
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.35, 28), new THREE.MeshLambertMaterial({ color: PALETTE.gold, emissive: 0x6b4a00, emissiveIntensity: 0.4 }));
        coin.rotation.z = Math.PI / 2; coin.position.y = h + 2; g.add(coin);
        this.spinners.push({ obj: coin, speed: b.active ? 1.6 : 0.4, axis: "y" });
        top = h + 4;
        break;
      }
      case "news": {
        g.add(this.box(3.5, 2.5, 3, 0xf2efe6));
        const sign = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 0.2), this.mat(0xc0392b));
        sign.position.set(0, 3.6, 0); g.add(sign);
        top = 5.5;
        break;
      }
      case "hall": {
        const h = 4 * grow;
        g.add(this.windowsBox(6, h, 5, 0xe4ddd0, b.active, seed));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x5b6c8f));
        dome.position.y = h; dome.castShadow = true; g.add(dome);
        top = h + 3.5;
        break;
      }
      case "studio": {
        const h = 4.5 * grow;
        g.add(this.windowsBox(5.5, h, 4.5, 0x30343c, b.active, seed));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.25, 8, 20), new THREE.MeshLambertMaterial({ color: b.id === "youtube" ? 0xe62117 : 0x7c5cff }));
        ring.position.y = h + 1.8; g.add(ring);
        this.spinners.push({ obj: ring, speed: b.active ? 1.4 : 0.2, axis: "y" });
        top = h + 3.6;
        break;
      }
      case "factory": {
        const h = 4 * grow;
        g.add(this.windowsBox(6.5, h, 4.5, 0xb9a593, b.active, seed));
        for (const x of [-1.8, 1.6]) {
          const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 4.5, 10), this.mat(0x7d4a3a));
          chimney.position.set(x, h + 2.25, -1); chimney.castShadow = true; g.add(chimney);
          // Smoke: a few instanced puffs that rise and fade — only when automation is running.
          const puffs = this.quality === "high" ? 10 : 6;
          const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.75 }), puffs);
          const t = new Float32Array(puffs).map((_, i) => i / puffs);
          g.add(mesh);
          this.smoke.push({ mesh, base: new THREE.Vector3(x, h + 4.6, -1), t, active: b.active });
        }
        top = h + 6.5;
        break;
      }
      case "mosque": {
        const h = 3.5 * grow;
        g.add(this.box(5, h, 5, PALETTE.white));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x1f9d7a));
        dome.position.y = h; dome.castShadow = true; g.add(dome);
        const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, h * 2.2, 10), this.mat(PALETTE.white));
        minaret.position.set(3, h * 1.1, 2.6); minaret.castShadow = true; g.add(minaret);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), this.mat(0x1f9d7a));
        cap.position.set(3, h * 2.2 + 0.7, 2.6); g.add(cap);
        top = h * 2.2 + 2;
        break;
      }
      case "library": {
        const h = 3.8 * grow;
        g.add(this.windowsBox(6, h, 4.5, 0xc9a77c, true, seed));
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.6, 2, 4), this.mat(PALETTE.roof));
        roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 1, 0.9); roof.position.y = h + 1; roof.castShadow = true; g.add(roof);
        top = h + 3;
        break;
      }
      case "gym": {
        const h = 3.2 * grow;
        g.add(this.windowsBox(6, h, 4.5, 0x9aa5b1, true, seed));
        const bar = new THREE.Group();
        bar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8).rotateZ(Math.PI / 2), this.mat(PALETTE.dark)));
        for (const x of [-1.3, 1.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 14).rotateZ(Math.PI / 2), this.mat(0xe63946)); p.position.x = x; bar.add(p); }
        bar.position.y = h + 1.4; g.add(bar);
        this.spinners.push({ obj: bar, speed: 0.6, axis: "y" });
        top = h + 2.8;
        break;
      }
      case "house": {
        const h = 2.6 * Math.min(grow, 1.6);
        g.add(this.windowsBox(4, h, 3.5, 0xf3ead9, true, seed));
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3, 1.8, 4), this.mat(PALETTE.roof));
        roof.rotation.y = Math.PI / 4; roof.position.y = h + 0.9; roof.castShadow = true; g.add(roof);
        const garden = new THREE.Mesh(new THREE.CircleGeometry(3.5, 20), this.mat(0x6fbf73));
        garden.rotation.x = -Math.PI / 2; garden.position.y = 0.04; g.add(garden);
        top = h + 2.6;
        break;
      }
    }
    if (b.neglected) this.ruin(g, seed);
    // A plot underneath so every building sits on its own lot.
    const lot = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshLambertMaterial({ color: 0xc9c3b4 }));
    lot.rotation.x = -Math.PI / 2; lot.position.y = 0.025; lot.receiveShadow = true;
    g.add(lot);
    g.traverse((o) => { o.userData.buildingId = b.id; });
    return { group: g, top };
  }

  /** Lay out (or relayout) the city from live data. Cheap to call; rebuilds meshes only if the set changes. */
  setBuildings(list: Building[]) {
    const key = list.map((b) => `${b.id}:${b.level}:${b.active ? 1 : 0}:${b.working ? 1 : 0}`).join("|");
    if (key === this.buildingsGroup.userData.key) return;
    this.buildingsGroup.userData.key = key;
    this.disposeGroup(this.buildingsGroup);
    this.buildingsGroup.clear();
    this.anchors = []; this.pickables = []; this.spinners = []; this.beacons = []; this.smoke = []; this.windowMats = [];
    this.plots = []; this.logos = []; this.prayerGlow = null;
    const others = list.filter((b) => b.id !== "hq");
    list.forEach((b, i) => {
      const { group, top } = this.makeBuilding(b, i * 97 + 13);
      if (b.id === "hq") group.position.set(0, 0, 0);
      else {
        const k = others.indexOf(b);
        const a = (k / others.length) * Math.PI * 2 + Math.PI / others.length;
        group.position.set(Math.cos(a) * PLOT_RADIUS, 0, Math.sin(a) * PLOT_RADIUS);
        group.rotation.y = -a + Math.PI / 2; // face the plaza
      }
      this.buildingsGroup.add(group);
      this.anchors.push({ id: b.id, obj: group, top });
      this.pickables.push(group);
      this.plots.push({ pos: group.position.clone(), active: b.active, working: !!b.working });
      const logo = LOGOS[b.id];
      if (logo) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTexture(logo.path, logo.hex), depthWrite: false }));
        sprite.scale.setScalar(2.4);
        sprite.position.set(0, top + 1.2, 0);
        sprite.userData.buildingId = b.id;
        group.add(sprite);
        this.logos.push(sprite);
      }
      if (b.id === "mosque") {
        // A soft green halo around the dome, lit at prayer times.
        const glow = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10), new THREE.MeshBasicMaterial({ color: 0x5dffc0, transparent: true, opacity: 0, depthWrite: false }));
        glow.position.y = 4; group.add(glow);
        this.prayerGlow = glow;
      }
    });
    this.workingIds = new Set(list.filter((b) => b.working).map((b) => b.id));
    this.life.relayout();
    // Workers only turn up while an automation is running: a few per busy building, shuttling to HQ.
    const busy = this.plots.map((p, i) => (p.working ? i : -1)).filter((i) => i > 0);
    this.crew = busy.length ? [0, ...busy] : [];
    this.crewSize = Math.min(this.workerState.length, busy.length * (this.quality === "high" ? 6 : 3));
    for (const w of this.workerState) { w.to = -1; this.pickTrip(w); w.t = Math.random(); }
    if (this.workers) {
      this.tmp.position.set(0, -50, 0); this.tmp.scale.setScalar(0.0001); this.tmp.updateMatrix();
      for (let i = 0; i < this.workerState.length; i++) { this.workers.setMatrixAt(i, this.tmp.matrix); this.packages?.setMatrixAt(i, this.tmp.matrix); }
      this.workers.instanceMatrix.needsUpdate = true;
      if (this.packages) this.packages.instanceMatrix.needsUpdate = true;
    }
    this.applyShadows();
  }

  /** HTML labels / bubbles that follow buildings on screen. */
  bindLabel(id: string, el: HTMLElement | null) {
    if (el) this.labelEls.set(id, el); else this.labelEls.delete(id);
  }

  /** Untouched for 14+ days: faded, dark windows, a slight lean, weeds and rubble. */
  private ruin(g: THREE.Group, seed: number) {
    const dust = new THREE.Color(0x6b5d4f);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const lm = mat as THREE.MeshLambertMaterial;
        if (!lm.color) continue;
        lm.color.multiplyScalar(0.7).lerp(dust, 0.3);
        lm.userData.ruined = true;
      }
    });
    g.rotation.z = 0.035;
    let r = seed;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const weeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.25, 0.9, 4), new THREE.MeshLambertMaterial({ color: 0x5f7a3a }), 22);
    const rubble = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.45), new THREE.MeshLambertMaterial({ color: 0x8b8680 }), 8);
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, d = 2.6 + rnd() * 1.8;
      this.tmp.position.set(Math.cos(a) * d, 0.4, Math.sin(a) * d); this.tmp.rotation.set(0, rnd() * 3, (rnd() - 0.5) * 0.4); this.tmp.scale.setScalar(0.6 + rnd() * 0.9); this.tmp.updateMatrix();
      weeds.setMatrixAt(i, this.tmp.matrix);
    }
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, d = 3 + rnd() * 1.3;
      this.tmp.position.set(Math.cos(a) * d, 0.18, Math.sin(a) * d); this.tmp.rotation.set(rnd(), rnd() * 3, rnd()); this.tmp.scale.setScalar(0.6 + rnd()); this.tmp.updateMatrix();
      rubble.setMatrixAt(i, this.tmp.matrix);
    }
    g.add(weeds, rubble);
  }

  private clearTreesNear(points: THREE.Vector3[], r: number) {
    if (!this.trees) return;
    const { trunks, crowns, spots } = this.trees;
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      if (!points.some((q) => q.distanceTo(p) < r)) return;
      m.makeScale(0.0001, 0.0001, 0.0001).setPosition(p.x, -10, p.z);
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  }

  // ─── Living city (driven by real data) ─────────────────────────────────────

  private worldStreak: number | null = null;
  /** Weather, streak lights, vault gold, goal sites, airships, runner glow, radar sweep. Returns goals that just completed. */
  setWorld(w: World, previousStreak: number | null): number[] {
    this.life.setWeather(w.weather.kind);
    if (this.worldStreak !== w.streak) { this.life.setStreak(w.streak, this.worldStreak ?? previousStreak); this.worldStreak = w.streak; }
    this.life.setGold(w.gold);
    this.life.setAirships(w.airships);
    this.life.setRunnerWorking(this.workingIds.has("runner"));
    this.life.setRadarScanning(w.radarScanning);
    this.setDistracted(w.distracted);
    if (this.radarSpin) this.radarSpin.speed = w.radarScanning ? 3.2 : this.plots.length ? 1.2 : 0.15;
    return this.life.setGoals(w.goals);
  }

  /** A real event happened → animate it once. */
  event(e: WorldEvent, onArrive?: () => void) {
    if (e.type === "mail") this.life.mailOut();
    else if (e.type === "reply") this.life.replyIn();
    else if (e.type === "money") this.life.moneyIn(MONEY_FROM[e.source ?? ""] ?? "hq", e.amount ?? 0, onArrive);
    else if (e.type === "hotgig") this.life.ping();
    else if (e.type === "job") this.life.beam(e.target ?? "hq");
  }

  landAirship(id: number) { this.life.landAirship(id); }

  /** Doomscrolling → fog rolls in (eased). */
  private distracted = 0;
  private distractTarget = 0;
  setDistracted(on: boolean) { this.distractTarget = on ? 1 : 0; }
  fireworksAtGoal(goalId: number) { const p = this.life.sitePosition(goalId); if (p) this.life.fireworks(p); }
  isRaining() { return this.life.isRaining(); }
  nightLevel() { return this.night; }

  /** Per-district loudness and stereo position from where the camera is. */
  private soundMix(): SoundMix {
    const out: SoundMix = [];
    const at = (key: SoundMix[number]["key"], p: THREE.Vector3 | null) => {
      if (!p) return;
      const d = this.camera.position.distanceTo(p);
      const gain = Math.pow(THREE.MathUtils.clamp((this.homeDist + 20 - d) / (this.homeDist - 5), 0, 1), 1.6);
      const v = p.clone().setY(3).project(this.camera);
      out.push({ key, gain, pan: THREE.MathUtils.clamp(v.x, -1, 1) });
    };
    const pos = (id: string) => { const a = this.anchors.find((x) => x.id === id); return a ? a.obj.getWorldPosition(new THREE.Vector3()) : null; };
    const sites = this.life.activeSites();
    if (sites.length) at("construction", sites.reduce((best, p) => (p.distanceTo(this.camera.position) < best.distanceTo(this.camera.position) ? p : best)));
    const factories = ["autopilot", "runner"].filter((id) => this.workingIds.has(id)).map(pos).filter((p): p is THREE.Vector3 => !!p);
    if (factories.length) at("factory", factories.reduce((best, p) => (p.distanceTo(this.camera.position) < best.distanceTo(this.camera.position) ? p : best)));
    at("vault", pos("vault"));
    at("mosque", pos("mosque"));
    return out;
  }

  // ─── Loop ───────────────────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    // Ease the orbit centre toward its goal (smooth focus / unfocus, no jumps).
    this.controls.target.lerp(this.focusGoal, 0.08);
    this.controls.autoRotate = !this.interacting && !this.focused && performance.now() - this.lastInteraction > 6000;
    this.controls.update();
    this.updateDayNight();

    // Traffic
    const lit = this.night > 0.35;
    (this.lights.material as THREE.MeshBasicMaterial).opacity = lit ? 0.95 : 0;
    this.carState.forEach((c, i) => {
      c.angle += c.speed * dt * (this.mood === "disco" ? 2 : this.mood === "hibernate" ? 0.3 : 1);
      const r = (c.ring ? RING_OUTER : RING_INNER) + (c.speed > 0 ? 0.9 : -0.9);
      const x = Math.cos(c.angle) * r, z = Math.sin(c.angle) * r;
      this.tmp.position.set(x, 0, z);
      this.tmp.rotation.set(0, -c.angle + (c.speed > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.cars.setMatrixAt(i, this.tmp.matrix);
      this.tmp.translateX(0.92); this.tmp.translateY(0.5); this.tmp.updateMatrix();
      this.lights.setMatrixAt(i, this.tmp.matrix);
    });
    this.cars.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;

    const pace = this.mood === "disco" ? 2.2 : this.mood === "hibernate" ? 0.25 : 1;
    for (const s of this.spinners) s.obj.rotation[s.axis] += s.speed * dt * pace + (s.speed === 0 ? Math.sin(t * 3) * 0.004 : 0);
    this.tickWorkers(dt * pace, t);
    this.life.tick(dt, t, this.night);
    if (this.onSound && t - this.lastSound > 0.12) { this.lastSound = t; this.onSound(this.soundMix()); }
    this.tickMood(t);
    if (this.prayerGlow) {
      const m = this.prayerGlow.material as THREE.MeshBasicMaterial;
      m.opacity += ((this.prayer ? 0.28 + Math.sin(t * 2) * 0.08 : 0) - m.opacity) * 0.05;
    }
    const blink = Math.sin(t * 4) > 0.6;
    for (const b of this.beacons) b.visible = blink;

    for (const s of this.smoke) {
      s.mesh.visible = s.active;
      if (!s.active) continue;
      for (let i = 0; i < s.t.length; i++) {
        s.t[i] = (s.t[i] + dt * 0.25) % 1;
        const p = s.t[i];
        this.tmp.position.set(s.base.x + Math.sin(p * 6 + i) * 0.4 + p * 1.2, s.base.y + p * 6, s.base.z + Math.cos(p * 5 + i) * 0.3);
        this.tmp.scale.setScalar(0.4 + p * 1.4);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.updateMatrix();
        s.mesh.setMatrixAt(i, this.tmp.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.adaptQuality(dt);
  }

  private updateDayNight() {
    const now = new Date();
    const h = this.timeOverride ?? now.getHours() + now.getMinutes() / 60;
    // 0 at midday, 1 at midnight, smooth through dawn/dusk.
    const real = h >= 7 && h <= 18 ? 0 : h >= 20 || h <= 5 ? 1 : h < 7 ? (7 - h) / 2 : (h - 18) / 2;
    // Hibernate dims the city; disco needs the dark to shine.
    const target = this.mood === "hibernate" ? Math.max(real, 0.75) : this.mood === "disco" ? Math.max(real, 0.85) : real;
    this.night += (target - this.night) * 0.05;
    const n = this.night;
    const oc = this.life?.overcast ?? 0;
    this.distracted += (this.distractTarget - this.distracted) * 0.02;
    const fogd = this.distracted;
    const sky = new THREE.Color(0xbfdcf0).lerp(new THREE.Color(0x9aa6b2), oc * 0.75).lerp(new THREE.Color(0xb7bcc2), fogd * 0.8).lerp(new THREE.Color(0x0d1426), n);
    const f = this.scene.fog as THREE.Fog;
    f.near = (this.homeDist + 10) * (1 - 0.8 * fogd);
    f.far = (this.homeDist + 150) * (1 - 0.6 * fogd);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.sun.intensity = (2.2 * (1 - n) + 0.35 * n) * (1 - oc * 0.45); // moonlight keeps the city readable; clouds dim it
    this.sun.color.setHex(n > 0.5 ? 0xaabbee : 0xffffff);
    this.hemi.intensity = 1.1 * (1 - n * 0.6);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, n - 0.3) * 1.2;
    this.groundMat.color.set(0xffffff).lerp(new THREE.Color(0x8e9a92), oc * 0.35).lerp(new THREE.Color(0x34443c), n); // rain darkens the grass
    for (const m of this.windowMats) m.emissiveIntensity = m.userData.ruined ? 0 : (m.userData.active ? 0.35 : 0.1) + n * 1.4;
    (this.lamps.material as THREE.MeshBasicMaterial).color.setHex(n > 0.35 ? 0xffe9a8 : 0xbdb6a0);
  }

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const a of this.anchors) {
      const el = this.labelEls.get(a.id);
      if (!el) continue;
      a.obj.getWorldPosition(this.v);
      this.v.y += a.top;
      this.v.project(this.camera);
      const behind = this.v.z > 1;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = behind ? "0" : "1";
      // Farther buildings get smaller labels, so the view doesn't clutter.
      el.style.zIndex = String(Math.round((1 - this.v.z) * 1000));
    }
  }

  private adaptQuality(dt: number) {
    if (this.quality === "low" || this.frameTimes.length > 180) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length === 180) {
      const avg = this.frameTimes.slice(60).reduce((a, b) => a + b, 0) / 120;
      if (avg > 1 / 42) this.setQuality("low"); // struggling — trade detail for smoothness
    }
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === "high" ? 1.75 : 1));
    this.renderer.shadowMap.enabled = q === "high";
    this.applyShadows();
    this.resize();
  }

  private applyShadows() {
    const on = this.quality === "high";
    this.sun.castShadow = on;
    this.buildingsGroup.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on; });
    this.cars.castShadow = on;
  }

  getQuality() { return this.quality; }

  /** Music mood: disco (party lights, fast city) or hibernate (dim, slow, sleepy). */
  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m;
    this.controls.autoRotateSpeed = m === "disco" ? 1.2 : m === "hibernate" ? 0.12 : 0.35;
    if (m === "normal") for (const w of this.windowMats) w.emissive.setHex(0xffd590);
  }

  /** Prayer time: the mosque glows. */
  setPrayer(on: boolean) { this.prayer = on; }

  private pickTrip(w: { from: number; to: number; t: number; speed: number; carry: boolean }) {
    const crew = this.crew;
    if (crew.length < 2) return;
    w.from = crew.includes(w.to) ? w.to : crew[Math.floor(Math.random() * crew.length)];
    // Busy building ⇄ HQ, mostly; sometimes between two busy buildings.
    let to = w.from === 0 ? crew[1 + Math.floor(Math.random() * (crew.length - 1))] : 0;
    if (w.from !== 0 && crew.length > 2 && Math.random() < 0.25) {
      const others = crew.filter((c) => c !== 0 && c !== w.from);
      to = others[Math.floor(Math.random() * others.length)];
    }
    w.to = to;
    w.t = 0;
    w.carry = w.from !== 0 && Math.random() < 0.75; // carrying finished work back to HQ
  }

  private tickWorkers(dt: number, t: number) {
    if (!this.workers || !this.packages || this.crew.length < 2) return;
    this.workerState.forEach((w, i) => {
      if (i >= this.crewSize) return; // off duty — parked out of sight
      const a = this.plots[w.from]?.pos, b = this.plots[w.to]?.pos;
      if (!a || !b) return;
      w.t += dt * w.speed * (w.carry ? 1.25 : 1);
      if (w.t >= 1) { this.pickTrip(w); return; }
      // Walk out to the plaza edge, across, and back in — stays off the buildings.
      const mid = a.clone().add(b).multiplyScalar(0.5).setLength(RING_INNER - 4.5);
      const p = w.t < 0.5 ? a.clone().lerp(mid, w.t * 2) : mid.clone().lerp(b, (w.t - 0.5) * 2);
      const next = w.t < 0.5 ? mid : b;
      this.tmp.position.set(p.x, Math.abs(Math.sin(t * 9 + i)) * 0.08, p.z);
      this.tmp.lookAt(next.x, 0, next.z);
      this.tmp.scale.setScalar(1.45); // readable from the default camera distance
      this.tmp.updateMatrix();
      this.workers.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.y += 2.2;
      this.tmp.scale.setScalar(w.carry ? 1.45 : 0.0001);
      this.tmp.updateMatrix();
      this.packages.setMatrixAt(i, this.tmp.matrix);
    });
    this.workers.instanceMatrix.needsUpdate = true;
    this.packages.instanceMatrix.needsUpdate = true;
  }

  private tickMood(t: number) {
    const disco = this.mood === "disco";
    this.discoLights.forEach((l, i) => {
      l.intensity = disco ? 120 : 0;
      if (!disco) return;
      const a = t * 1.4 + (i * Math.PI * 2) / 3;
      l.position.set(Math.cos(a) * 16, 9 + Math.sin(t * 3 + i) * 2, Math.sin(a) * 16);
    });
    if (disco) {
      const beat = (Math.sin(t * Math.PI * 4) + 1) / 2; // ~120 bpm pulse
      const hue = (t * 0.25) % 1;
      this.windowMats.forEach((m, i) => m.emissive.setHSL((hue + i * 0.13) % 1, 1, 0.55));
      this.anchors.forEach((a, i) => a.obj.scale.setScalar(1 + (i % 2 ? beat : 1 - beat) * 0.035));
    } else if (this.anchors[0] && this.anchors[0].obj.scale.y !== 1 && this.anchors[0].obj !== this.hovered) {
      this.anchors.forEach((a) => { if (a.obj !== this.hovered) a.obj.scale.setScalar(1); });
    }
  }

  /** Force day (12), night (22) or follow the real clock (null). */
  setTimeOfDay(hour: number | null) { this.timeOverride = hour; }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private pick(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const ship = this.ray.intersectObjects(this.life.pickables, true)[0];
    if (ship?.object.userData.airshipId != null) return `airship:${ship.object.userData.airshipId}`;
    const hit = this.ray.intersectObjects(this.pickables, true)[0];
    if (hit?.object.userData.goalId != null) return `goal:${hit.object.userData.goalId}`;
    return (hit?.object.userData.buildingId as string | undefined) ?? null;
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    if (moved > (e.pointerType === "touch" ? 12 : 6) || performance.now() - this.down.t > 500) return; // that was a drag
    const id = this.pick(e);
    if (id?.startsWith("airship:")) this.onPickAirship(Number(id.slice(8)));
    else if (id) this.onPick(id);
  };
  private lastMove = 0;
  private onMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - this.lastMove < 60 || e.buttons) return;
    this.lastMove = now;
    const id = this.pick(e);
    const obj = id ? this.anchors.find((a) => a.id === id)?.obj ?? null : null;
    if (obj === this.hovered) return;
    if (this.hovered) this.hovered.scale.setScalar(1);
    this.hovered = obj;
    if (obj) obj.scale.setScalar(1.05);
    this.renderer.domElement.style.cursor = obj || id?.startsWith("airship:") ? "pointer" : "grab";
    this.onHover(id);
  };

  /** Glide toward a building (camera keeps its angle; orbit centre moves there). */
  focus(id: string) {
    const a = this.anchors.find((x) => x.id === id);
    if (!a) return;
    a.obj.getWorldPosition(this.v);
    this.focusGoal.set(this.v.x * 0.85, 3, this.v.z * 0.85);
    this.focused = true;
    this.lastInteraction = performance.now();
  }

  /** Back to the whole city; auto-rotate resumes a few seconds later. */
  unfocus() {
    this.focusGoal.set(0, 3, 0);
    this.focused = false;
    this.lastInteraction = performance.now();
  }

  /** A bottom sheet covers part of the screen (phones): lift the picture so the focused building stays visible. */
  private bottomInset = 0;
  setBottomInset(fraction: number) {
    this.bottomInset = Math.max(0, Math.min(0.8, fraction));
    this.applyViewOffset();
  }
  private applyViewOffset() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    if (this.bottomInset > 0) this.camera.setViewOffset(w, h, 0, (h * this.bottomInset) / 2, w, h);
    else this.camera.clearViewOffset();
  }

  /** Reset the camera to the default view. */
  resetView() {
    this.unfocus();
    this.camera.position.copy(HOME_DIR).multiplyScalar(this.homeDist).add(this.focusGoal);
    this.controls.target.copy(this.focusGoal);
    this.lastInteraction = 0;
  }

  /**
   * How far back the camera must sit so the whole city fits across the screen.
   * A wide desktop needs ~80 units; a portrait phone (narrow horizontal FOV)
   * needs about twice that, or the outer buildings fall off the sides.
   */
  private fitDistance(aspect: number) {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    return Math.max(80, Math.min(190, (PLOT_RADIUS + 6) / Math.tan(halfH)));
  }

  private resize = () => {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyViewOffset();
    // Re-frame only when the fit changes noticeably (not on every phone URL-bar wiggle),
    // and never while you're zoomed into a building.
    const fit = this.fitDistance(w / h);
    const changed = Math.abs(fit - this.homeDist) / this.homeDist > 0.06;
    this.homeDist = fit;
    this.controls.maxDistance = Math.max(120, fit * 1.3);
    this.controls.minDistance = w < 640 ? 16 : 22;
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) { fog.near = fit + 10; fog.far = fit + 150; }
    if (changed && !this.focused) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).addScaledVector(dir, fit);
    }
  };

  private onVisibility = () => { if (document.hidden) this.stop(); else if (this.wantRunning) this.start(); };
  private wantRunning = false;
  setActive(on: boolean) { this.wantRunning = on; if (on && !document.hidden) { this.resize(); this.start(); } else this.stop(); }

  private disposeGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        const mm = mat as THREE.MeshLambertMaterial;
        mm.emissiveMap?.dispose();
        mm.dispose();
      }
    });
  }

  dispose() {
    this.stop();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("resize", this.resize);
    this.resizeObs?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.controls.dispose();
    this.disposeGroup(this.scene);
    this.renderer.dispose();
    el.remove();
  }
}
