// A building's interior as a reusable three.js scene: the room, its real-data
// surfaces (monitor, cork board, stats plaque, stacks), a set of props unique
// to each room, and named camera "spots" you can glide between.
//
// Two modes:
//   full       — "Step inside" from the empire: fly-in, cursor parallax, shadows
//   background — behind a page (Gig radar, Money, …): 24 fps, no shadows, and
//                the page moves the camera to the part of the room you're using

import * as THREE from "three";
import type { Interior } from "@/lib/services/empire-extras";

export type Spot = "overview" | "screen" | "board" | "shelf" | "pile" | "prop";

const SPOTS: Record<Spot, { cam: [number, number, number]; look: [number, number, number] }> = {
  overview: { cam: [0, 3.1, 6.5], look: [0, 2.4, -3.5] },
  screen: { cam: [0, 3, -0.4], look: [0, 2.85, -4] },
  board: { cam: [-2.4, 3.4, -0.8], look: [-6.95, 3.4, -1] },
  shelf: { cam: [2.4, 3.6, -0.8], look: [6.95, 3.6, -1] },
  pile: { cam: [1.6, 2.6, 4.6], look: [4.4, 0.6, 1.6] },
  prop: { cam: [-1.2, 2.7, 4.4], look: [-4.2, 1.4, 1.4] },
};

export const THEMES: Record<Interior["theme"], { wall: number; floor: number; accent: number; pile: number; glow: string }> = {
  studio: { wall: 0x2b2f3a, floor: 0x3a3226, accent: 0x7c5cff, pile: 0x9aa3b5, glow: "#7c5cff" },
  media: { wall: 0x2a2224, floor: 0x332a2a, accent: 0xe62117, pile: 0xe62117, glow: "#ff4d4d" },
  vault: { wall: 0x4a4f57, floor: 0x2f3338, accent: 0xe0b44c, pile: 0xe0b44c, glow: "#ffd27a" },
  library: { wall: 0x4a3626, floor: 0x5a4330, accent: 0xb4553f, pile: 0x8b5a2b, glow: "#ffcf8a" },
  gym: { wall: 0x3b4048, floor: 0x26292e, accent: 0xe63946, pile: 0x2c3138, glow: "#ff6b6b" },
  mosque: { wall: 0xf1ece2, floor: 0x1f6f56, accent: 0x1f9d7a, pile: 0x1f9d7a, glow: "#5dffc0" },
  office: { wall: 0xdfe6ee, floor: 0x8a929c, accent: 0x2f6fde, pile: 0xf5f3ee, glow: "#7fb2ff" },
  hq: { wall: 0xd8d0c0, floor: 0x6b5a45, accent: 0x14b8a6, pile: 0xe0b44c, glow: "#5eead4" },
  radar: { wall: 0x1d2a24, floor: 0x16201b, accent: 0x3ddc84, pile: 0x3ddc84, glow: "#3ddc84" },
  factory: { wall: 0x5a4a3c, floor: 0x3c342c, accent: 0xd97757, pile: 0xc8955a, glow: "#ff9a6b" },
  news: { wall: 0xf2efe6, floor: 0x6b6258, accent: 0xc0392b, pile: 0xf2efe6, glow: "#ff8a7a" },
  hall: { wall: 0xe4ddd0, floor: 0x5b6c8f, accent: 0x5865f2, pile: 0x5865f2, glow: "#8b9bff" },
  home: { wall: 0xf3ead9, floor: 0x9c7a55, accent: 0xb4553f, pile: 0x6fbf73, glow: "#ffd9a8" },
};

type Anim = (t: number, dt: number) => void;

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RoomEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private anims: Anim[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private start = performance.now();
  private camGoal = new THREE.Vector3(...SPOTS.overview.cam);
  private lookGoal = new THREE.Vector3(...SPOTS.overview.look);
  private look = new THREE.Vector3(...SPOTS.overview.look);
  private mouse = { x: 0, y: 0 };
  private depth = 0; // background mode: scrolling walks you further into the room
  private ro: ResizeObserver;
  private spot: Spot = "overview";

  constructor(private host: HTMLElement, private data: Interior, private mode: "full" | "background" = "full") {
    const bg = mode === "background";
    this.renderer = new THREE.WebGLRenderer({ antialias: !bg, alpha: false, powerPreference: bg ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(bg ? 1 : Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = !bg;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.build();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    if (!bg) host.addEventListener("pointermove", this.onMove);
    this.camera.position.set(0, 4.6, bg ? 6.5 : 13);
  }

  private onMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.mouse.x = (e.clientX - r.left) / r.width - 0.5;
    this.mouse.y = (e.clientY - r.top) / r.height - 0.5;
  };

  setSpot(s: Spot) {
    this.spot = s;
    this.camGoal.set(...SPOTS[s].cam);
    this.lookGoal.set(...SPOTS[s].look);
  }
  /** 0–1: how far down the page you've scrolled (background mode, overview spot). */
  setDepth(d: number) { this.depth = Math.max(0, Math.min(1, d)); }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%"; this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 68 : 50;
    this.camera.updateProjectionMatrix();
  }

  run() {
    if (this.running) return;
    this.running = true;
    const fps = this.mode === "background" ? 24 : 60;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < 1000 / fps - 1) return;
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      this.tick(now / 1000, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  pause() { this.running = false; cancelAnimationFrame(this.raf); }

  private tick(t: number, dt: number) {
    const intro = this.mode === "full" ? Math.min(1, (performance.now() - this.start) / 1400) : 1;
    const ease = 1 - Math.pow(1 - intro, 3);
    const goal = this.camGoal.clone();
    if (this.mode === "full") goal.add(new THREE.Vector3(this.mouse.x * 1.2, -this.mouse.y * 0.5 + (1 - ease) * 1.5, (1 - ease) * 6.5));
    else {
      goal.x += Math.sin(t * 0.15) * 0.35; // a slow idle sway so the room feels alive
      if (this.spot === "overview") goal.z -= this.depth * 3;
    }
    this.camera.position.lerp(goal, this.mode === "full" && intro < 1 ? 0.2 : 0.04);
    this.look.lerp(this.lookGoal, 0.05);
    this.camera.lookAt(this.look);
    for (const a of this.anims) a(t, dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.pause();
    this.ro.disconnect();
    this.host.removeEventListener("pointermove", this.onMove);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshBasicMaterial[]) { mat.map?.dispose(); mat.dispose(); }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ─── Building the room ─────────────────────────────────────────────────────

  private lam(color: number, extra: THREE.MeshLambertMaterialParameters = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, extra?: THREE.MeshLambertMaterialParameters) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.lam(color, extra));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  private cyl(rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 16, extra?: THREE.MeshLambertMaterialParameters) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.lam(color, extra));
    m.position.set(x, y, z); m.castShadow = true;
    this.scene.add(m);
    return m;
  }

  private build() {
    const d = this.data, t = THEMES[d.theme], s = this.scene;
    s.background = new THREE.Color(t.wall).multiplyScalar(0.55);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), this.lam(t.floor)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), this.lam(t.wall)); back.position.set(0, 3.5, -5); back.receiveShadow = true; s.add(back);
    for (const x of [-7, 7]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), this.lam(new THREE.Color(t.wall).multiplyScalar(0.85).getHex())); side.position.set(x, 3.5, 1); side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; s.add(side); }
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), this.lam(new THREE.Color(t.accent).multiplyScalar(0.55).getHex())); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.scale.set(1.4, 1, 1); s.add(rug);
    s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
    const lamp = new THREE.PointLight(0xfff1d6, 60, 30, 1.6); lamp.position.set(0, 6, 1); lamp.castShadow = this.mode === "full"; s.add(lamp);
    const glow = new THREE.PointLight(new THREE.Color(t.glow), 18, 10, 2); glow.position.set(0, 2.4, -3.2); s.add(glow);

    // Desk + monitor with the real data.
    this.box(5, 0.2, 2, 0x6b4f35, 0, 1.5, -3.6);
    for (const [x, z] of [[-2.3, -4.4], [2.3, -4.4], [-2.3, -2.8], [2.3, -2.8]]) this.box(0.15, 1.5, 0.15, 0x4a3626, x, 0.75, z);
    const screen = canvas(1024, 600, (g) => {
      g.fillStyle = "#0b0f17"; g.fillRect(0, 0, 1024, 600);
      g.fillStyle = t.glow; g.font = "600 44px ui-monospace, monospace"; g.fillText(d.screen.title, 36, 70);
      g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(36, 92, 952, 2);
      g.fillStyle = "#e5e7eb"; g.font = "32px ui-monospace, monospace";
      d.screen.lines.slice(0, 9).forEach((l, i) => g.fillText(l.slice(0, 54), 36, 150 + i * 50));
    });
    const dark = this.lam(0x111111);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 0.12), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: screen }), dark]);
    monitor.position.set(0, 2.85, -4); monitor.castShadow = true; s.add(monitor);
    this.box(0.2, 0.7, 0.2, 0x222222, 0, 1.95, -4.05);

    if (d.board.length) {
      const board = canvas(800, 520, (g) => {
        g.fillStyle = "#b5895a"; g.fillRect(0, 0, 800, 520);
        const colors = ["#fff59d", "#a5f3fc", "#fbcfe8", "#bbf7d0", "#fde68a"];
        d.board.slice(0, 5).forEach((note, i) => {
          const x = 30 + (i % 3) * 255, y = 30 + Math.floor(i / 3) * 245;
          g.fillStyle = colors[i % colors.length]; g.fillRect(x, y, 225, 215);
          g.fillStyle = "#c0392b"; g.beginPath(); g.arc(x + 112, y + 14, 8, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#1f2937"; g.font = "22px system-ui, sans-serif";
          let line = "", ly = y + 50;
          for (const w of note.split(" ")) { if ((line + w).length > 18) { g.fillText(line, x + 14, ly); line = ""; ly += 28; if (ly > y + 200) break; } line += `${w} `; }
          if (ly <= y + 200) g.fillText(line, x + 14, ly);
        });
      });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshLambertMaterial({ map: board }));
      b.position.set(-6.95, 3.4, -1); b.rotation.y = Math.PI / 2; s.add(b);
    }
    if (d.shelf.length) {
      const plaque = canvas(700, 300, (g) => {
        g.fillStyle = "#1c1f26"; g.fillRect(0, 0, 700, 300);
        d.shelf.slice(0, 3).forEach((x, i) => {
          g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "26px system-ui, sans-serif"; g.fillText(x.label, 30, 60 + i * 90);
          g.fillStyle = t.glow; g.font = "700 40px system-ui, sans-serif"; g.fillText(x.value, 30, 104 + i * 90);
        });
      });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3), new THREE.MeshBasicMaterial({ map: plaque }));
      p.position.set(6.95, 3.6, -1); p.rotation.y = -Math.PI / 2; s.add(p);
    }
    if (d.piles > 0) {
      const geo = d.theme === "library" ? new THREE.BoxGeometry(0.3, 1, 0.75) : new THREE.BoxGeometry(0.8, 0.3, 0.42);
      const mesh = new THREE.InstancedMesh(geo, this.lam(t.pile, { emissive: d.theme === "vault" ? 0x5a3c00 : 0x000000, emissiveIntensity: 0.4 }), d.piles);
      const o = new THREE.Object3D();
      for (let i = 0; i < d.piles; i++) {
        const layer = Math.floor(i / 8);
        o.position.set(3.2 + ((i % 8) % 4) * 0.84, 0.15 + layer * 0.31, 1.4 + Math.floor((i % 8) / 4) * 0.46);
        o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      }
      mesh.castShadow = true;
      s.add(mesh);
    }
    this.props(d.theme, t);
  }

  /** The props that make each room its own. The "prop" spot looks at the main one (front-left). */
  private props(theme: Interior["theme"], t: (typeof THEMES)[Interior["theme"]]) {
    const s = this.scene;
    const glowMat = (c: number | string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c as THREE.ColorRepresentation) });
    switch (theme) {
      case "radar": {
        // A radar dish that turns, a glowing scope on the desk with a sweep and blips, a world map.
        const base = this.cyl(0.25, 0.4, 2.2, 0x2c3138, -4.2, 1.1, 1.4);
        const dish = new THREE.Group(); dish.position.set(-4.2, 2.5, 1.4); s.add(dish);
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), this.lam(0xeeeeee, { side: THREE.DoubleSide }));
        bowl.rotation.x = Math.PI / 2.4; dish.add(bowl);
        void base;
        this.anims.push((tt) => { dish.rotation.y = tt * 0.9; });
        const scope = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), glowMat(0x0d3b22)); scope.rotation.x = -Math.PI / 2; scope.position.set(-1.7, 1.62, -3.3); s.add(scope);
        const sweep = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16, 0, 0.6), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.7 }));
        sweep.rotation.x = -Math.PI / 2; sweep.position.set(-1.7, 1.63, -3.3); s.add(sweep);
        this.anims.push((tt) => { sweep.rotation.z = tt * 2; });
        const map = canvas(1024, 512, (g) => {
          g.fillStyle = "#0e1a14"; g.fillRect(0, 0, 1024, 512);
          g.fillStyle = "rgba(61,220,132,0.35)";
          for (let y = 30; y < 500; y += 14) for (let x = 20; x < 1010; x += 14) if (Math.sin(x * 0.012) * Math.cos(y * 0.018) + Math.sin((x + y) * 0.006) > 0.55) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = "#3ddc84"; for (const [x, y] of [[300, 180], [520, 160], [700, 260], [180, 300]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
        });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.9 })); wall.position.set(-4.3, 4.8, -4.98); s.add(wall);
        break;
      }
      case "studio": {
        // A slowly turning cube on a pedestal, a gamepad, a second monitor and a poster.
        this.cyl(0.6, 0.7, 1.2, 0x30343c, -4.2, 0.6, 1.4);
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.lam(0x7c5cff, { emissive: 0x2a1a80, emissiveIntensity: 0.6 }));
        cube.position.set(-4.2, 1.8, 1.4); s.add(cube);
        this.anims.push((tt) => { cube.rotation.set(tt * 0.5, tt * 0.7, 0); cube.position.y = 1.8 + Math.sin(tt * 1.4) * 0.12; });
        const pad = this.box(0.7, 0.12, 0.4, 0x1f2937, 1.4, 1.66, -3.2); pad.rotation.y = 0.3;
        const m2 = this.box(1.8, 1.2, 0.1, 0x111111, 2.6, 2.6, -3.9); m2.rotation.y = -0.35;
        const poster = canvas(512, 720, (g) => {
          const grd = g.createLinearGradient(0, 0, 0, 720); grd.addColorStop(0, "#1b1035"); grd.addColorStop(1, "#7c5cff"); g.fillStyle = grd; g.fillRect(0, 0, 512, 720);
          g.fillStyle = "#fff"; g.font = "700 64px system-ui"; g.fillText("NOW", 40, 140); g.fillText("BUILDING", 40, 220);
          g.font = "32px system-ui"; g.fillStyle = "rgba(255,255,255,0.8)"; g.fillText(this.data.shelf[0]?.value ? `${this.data.shelf[0].value} commits this week` : "Ship it.", 40, 640);
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.25), new THREE.MeshBasicMaterial({ map: poster })); p.position.set(4.6, 4.3, -4.98); s.add(p);
        break;
      }
      case "media": {
        // Camera on a tripod, a ring light, a mic and an ON AIR sign.
        for (const a of [0, 2.1, 4.2]) { const leg = this.cyl(0.04, 0.04, 2, 0x222222, -4.2 + Math.cos(a) * 0.45, 1, 1.4 + Math.sin(a) * 0.45, 6); leg.rotation.z = Math.cos(a) * 0.22; leg.rotation.x = -Math.sin(a) * 0.22; }
        this.box(0.8, 0.5, 0.5, 0x111111, -4.2, 2.15, 1.4);
        this.cyl(0.18, 0.18, 0.4, 0x333333, -4.2, 2.15, 1.05, 16).rotation.x = Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 10, 40), glowMat(0xfff4e0)); ring.position.set(-2.4, 3.2, -4.3); s.add(ring);
        const ringLight = new THREE.PointLight(0xfff4e0, 10, 8); ringLight.position.copy(ring.position); s.add(ringLight);
        this.cyl(0.12, 0.12, 0.35, 0x222222, 1.6, 1.85, -3.1, 12);
        const sign = canvas(512, 160, (g) => { g.fillStyle = "#2a0505"; g.fillRect(0, 0, 512, 160); g.fillStyle = "#ff3030"; g.font = "800 92px system-ui"; g.fillText("ON AIR", 60, 115); });
        const signMat = new THREE.MeshBasicMaterial({ map: sign });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.62), signMat); sm.position.set(3.4, 5.3, -4.98); s.add(sm);
        this.anims.push((tt) => { signMat.color.setScalar(0.75 + Math.sin(tt * 3) * 0.25); });
        break;
      }
      case "vault": {
        // The round safe door (its wheel turns), and a money counter on the desk.
        const door = this.cyl(1.6, 1.6, 0.3, 0x8a929c, -4.3, 2.3, -4.8, 32); door.rotation.x = Math.PI / 2;
        const wheel = new THREE.Group(); wheel.position.set(-4.3, 2.3, -4.55); s.add(wheel);
        for (let i = 0; i < 3; i++) { const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), this.lam(0xe0b44c)); spoke.rotation.z = (i * Math.PI) / 3; wheel.add(spoke); }
        this.anims.push((tt) => { wheel.rotation.z = tt * 0.4; });
        this.box(0.9, 0.5, 0.6, 0x2c3138, 1.7, 1.85, -3.3);
        this.box(1.2, 1.4, 1, 0x4a5560, -4.2, 0.7, 1.4); // a smaller safe in front (the prop spot)
        this.cyl(0.25, 0.25, 0.08, 0xe0b44c, -4.2, 1.1, 1.92, 20).rotation.x = Math.PI / 2;
        break;
      }
      case "library": {
        // Bookshelves along the back, a reading chair and a warm floor lamp.
        const books = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.8, 0.5), this.lam(0xffffff), 120);
        const o = new THREE.Object3D(), c = new THREE.Color();
        for (let i = 0; i < 120; i++) {
          const row = Math.floor(i / 30), col = i % 30;
          o.position.set(-6.3 + col * 0.25 + (col > 14 ? 3.6 : 0), 3.6 + row * 0.95, -4.7); o.rotation.z = col % 7 === 0 ? 0.12 : 0; o.updateMatrix();
          books.setMatrixAt(i, o.matrix); books.setColorAt(i, c.setHSL((i * 0.137) % 1, 0.45, 0.4));
        }
        s.add(books);
        for (const y of [3.15, 4.1, 5.05, 6]) { this.box(3.9, 0.08, 0.6, 0x5a4330, -4.5, y, -4.7); this.box(3.9, 0.08, 0.6, 0x5a4330, 4.5, y, -4.7); }
        this.box(1.6, 0.6, 1.4, 0x7a2e2e, -4.2, 0.5, 1.4); this.box(1.6, 1.4, 0.3, 0x7a2e2e, -4.2, 1.2, 2.0);
        this.cyl(0.04, 0.04, 2.6, 0x222222, -5.4, 1.3, 2.2, 6);
        const shade = this.cyl(0.2, 0.45, 0.5, 0xf5deb3, -5.4, 2.7, 2.2); void shade;
        const warm = new THREE.PointLight(0xffc27a, 14, 7); warm.position.set(-5.4, 2.5, 2.2); s.add(warm);
        break;
      }
      case "gym": {
        // A dumbbell rack, a bench, a punching bag that sways and a mirror.
        this.box(2.4, 0.9, 0.6, 0x2c3138, -4.2, 0.45, 1.4);
        for (let i = 0; i < 5; i++) { const bell = new THREE.Group(); bell.position.set(-5.1 + i * 0.45, 1.05, 1.4); s.add(bell);
          bell.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6).rotateZ(Math.PI / 2), this.lam(0x999999)));
          for (const x of [-0.2, 0.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11 + i * 0.015, 0.11 + i * 0.015, 0.1, 10).rotateZ(Math.PI / 2), this.lam(0xe63946)); w.position.x = x; bell.add(w); } }
        this.box(2.2, 0.25, 0.7, 0x111111, 2.4, 0.9, 3.4);
        const bag = new THREE.Group(); bag.position.set(4.6, 6.6, 0); s.add(bag);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), this.lam(0x777777)); chain.position.y = -0.7; bag.add(chain);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 14), this.lam(0x8b1e1e)); body.position.y = -2.5; body.castShadow = true; bag.add(body);
        this.anims.push((tt) => { bag.rotation.z = Math.sin(tt * 1.3) * 0.05; });
        const mirror = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshLambertMaterial({ color: 0xbfd3e6, emissive: 0x334455, emissiveIntensity: 0.3 })); mirror.position.set(4, 4.4, -4.97); s.add(mirror);
        break;
      }
      case "mosque": {
        // A mihrab arch, prayer rugs, a Qur'an on its stand (rehal) and hanging lanterns.
        const arch = canvas(512, 720, (g) => {
          g.fillStyle = "#1f9d7a"; g.beginPath(); g.moveTo(40, 720); g.lineTo(40, 300); g.quadraticCurveTo(256, -60, 472, 300); g.lineTo(472, 720); g.fill();
          g.strokeStyle = "#e9d8a6"; g.lineWidth = 14; g.stroke();
          g.fillStyle = "rgba(255,255,255,0.12)"; for (let i = 0; i < 6; i++) g.fillRect(80 + i * 60, 360, 30, 300);
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.7), new THREE.MeshBasicMaterial({ map: arch, transparent: true })); m.position.set(-4.3, 2.4, -4.97); s.add(m);
        for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), this.lam([0x8b1e3f, 0x1e3a8a, 0x14532d][i])); r.rotation.x = -Math.PI / 2; r.position.set(-1.6 + i * 1.6, 0.02, 2.6); s.add(r); }
        const left = this.box(0.7, 0.05, 0.6, 0x8b5a2b, -4.35, 1.05, 1.4); left.rotation.z = 0.6;
        const right = this.box(0.7, 0.05, 0.6, 0x8b5a2b, -4.05, 1.05, 1.4); right.rotation.z = -0.6;
        this.box(0.55, 0.08, 0.42, 0x14532d, -4.2, 1.3, 1.4);
        for (const [x, z] of [[-3, -3], [0, -2.2], [3, -3], [-1.5, -0.8], [1.5, -0.8]]) {
          const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 6), glowMat(0xffc14d)); lan.position.set(x, 5.6, z); s.add(lan);
          this.cyl(0.01, 0.01, 1.2, 0x555555, x, 6.4, z, 4);
        }
        const warm = new THREE.PointLight(0xffc14d, 16, 12); warm.position.set(0, 5.4, 0); s.add(warm);
        break;
      }
      case "office": {
        // A whiteboard, a desk phone, a filing cabinet and a plant.
        const wb = canvas(800, 480, (g) => {
          g.fillStyle = "#fafafa"; g.fillRect(0, 0, 800, 480);
          g.strokeStyle = "#2f6fde"; g.lineWidth = 6; g.beginPath(); g.moveTo(60, 380); g.lineTo(220, 280); g.lineTo(380, 320); g.lineTo(560, 160); g.lineTo(740, 90); g.stroke();
          g.fillStyle = "#1f2937"; g.font = "600 40px system-ui"; g.fillText("Pipeline", 60, 70);
        });
        const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), new THREE.MeshBasicMaterial({ map: wb })); b.position.set(-4.2, 4.2, -4.97); s.add(b);
        this.box(0.6, 0.18, 0.45, 0x1f2937, 1.8, 1.7, -3.2);
        this.box(1.1, 2, 0.9, 0x8a929c, -4.2, 1, 1.4);
        for (let i = 0; i < 3; i++) this.box(0.9, 0.04, 0.02, 0x555555, -4.2, 0.5 + i * 0.6, 1.86);
        this.cyl(0.35, 0.28, 0.6, 0xb4553f, 5.6, 0.3, 3.6);
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), this.lam(0x3f8f5a, { flatShading: true })); leaves.position.set(5.6, 1.1, 3.6); s.add(leaves);
        break;
      }
      case "hq": {
        // A trophy shelf (one trophy per 2 levels), a globe that turns and a flag.
        const trophies = Math.max(1, Math.min(10, Math.round(this.data.piles / 4)));
        this.box(2.6, 0.1, 0.6, 0x5a4330, -4.2, 1.6, 1.4);
        this.box(2.6, 1.6, 0.1, 0x5a4330, -4.2, 0.8, 1.7);
        for (let i = 0; i < trophies; i++) {
          const x = -5.3 + (i % 5) * 0.55, y = i < 5 ? 1.95 : 2.55;
          this.cyl(0.12, 0.06, 0.3, 0xe0b44c, x, y, 1.4, 10, { emissive: 0x5a3c00, emissiveIntensity: 0.5 });
          this.cyl(0.08, 0.1, 0.1, 0xe0b44c, x, y - 0.2, 1.4, 10);
        }
        if (trophies > 5) this.box(2.6, 0.1, 0.6, 0x5a4330, -4.2, 2.2, 1.4);
        this.cyl(0.05, 0.25, 1.4, 0x5a4330, 2.2, 2.2, -3.4, 8);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), this.lam(0x2f6fde, { emissive: 0x0a1a40, emissiveIntensity: 0.4 })); globe.position.set(2.2, 2.4, -3.4); s.add(globe);
        this.anims.push((tt) => { globe.rotation.y = tt * 0.4; });
        this.cyl(0.04, 0.04, 3.4, 0x333333, 5.6, 1.7, -3.8, 6);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 8, 1), this.lam(0x14b8a6, { side: THREE.DoubleSide })); flag.position.set(6.3, 3.0, -3.8); s.add(flag);
        const fp = flag.geometry.attributes.position as THREE.BufferAttribute;
        const base = Float32Array.from(fp.array as Float32Array);
        this.anims.push((tt) => { for (let i = 0; i < fp.count; i++) fp.setZ(i, base[i * 3 + 2] + Math.sin(tt * 3 + base[i * 3] * 3) * 0.08 * (base[i * 3] + 0.7)); fp.needsUpdate = true; });
        break;
      }
      case "factory": {
        // A conveyor belt carrying envelopes, and a server rack with blinking lights.
        this.box(4.4, 0.25, 0.9, 0x2c3138, -3.6, 1, 1.6);
        for (const x of [-5.6, -1.6]) this.box(0.2, 1, 0.2, 0x444444, x, 0.5, 1.6);
        const env = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), this.lam(0xf5f3ee), 6);
        s.add(env);
        const o = new THREE.Object3D();
        this.anims.push((tt) => { for (let i = 0; i < 6; i++) { const k = ((tt * 0.25 + i / 6) % 1); o.position.set(-5.6 + k * 4, 1.17, 1.6); o.updateMatrix(); env.setMatrixAt(i, o.matrix); } env.instanceMatrix.needsUpdate = true; });
        this.box(1.4, 3.2, 1, 0x1a1d22, 5.3, 1.6, -3.6);
        const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 24);
        for (let i = 0; i < 24; i++) { o.position.set(4.8 + (i % 4) * 0.25, 0.6 + Math.floor(i / 4) * 0.45, -3.08); o.updateMatrix(); leds.setMatrixAt(i, o.matrix); }
        s.add(leds);
        const c = new THREE.Color();
        this.anims.push((tt) => { for (let i = 0; i < 24; i++) leds.setColorAt(i, c.setHex(Math.sin(tt * 6 + i * 1.7) > 0.2 ? (i % 5 === 0 ? 0xffb020 : 0x34d399) : 0x0b2a1c)); if (leds.instanceColor) leds.instanceColor.needsUpdate = true; });
        break;
      }
      case "news": {
        // A vintage TV with flickering static, newspaper stacks and a BREAKING banner.
        this.box(1.6, 1.2, 1.1, 0x5a4330, -4.2, 0.6, 1.4);
        const tvMat = new THREE.MeshBasicMaterial({ color: 0x9fb3c8 });
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), tvMat); scr.position.set(-4.2, 0.65, 1.96); s.add(scr);
        this.anims.push(() => { tvMat.color.setScalar(0.5 + Math.random() * 0.25); });
        for (let i = 0; i < 4; i++) this.box(0.9, 0.5, 0.65, 0xf2efe6, 2.4 + i * 0.25, 0.25 + 0, 3.6 - i * 0.7);
        const banner = canvas(800, 140, (g) => { g.fillStyle = "#c0392b"; g.fillRect(0, 0, 800, 140); g.fillStyle = "#fff"; g.font = "800 80px system-ui"; g.fillText("BREAKING", 40, 100); });
        const b = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.6), new THREE.MeshBasicMaterial({ map: banner })); b.position.set(3.6, 5.6, -4.97); s.add(b);
        break;
      }
      case "hall": {
        // A round table with chairs and a community banner.
        this.cyl(1.3, 1.3, 0.12, 0x5a4330, -3.8, 1.2, 1.6, 28);
        this.cyl(0.15, 0.3, 1.2, 0x3a2b1f, -3.8, 0.6, 1.6, 10);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; this.box(0.6, 0.9, 0.6, t.accent, -3.8 + Math.cos(a) * 1.9, 0.45, 1.6 + Math.sin(a) * 1.9); }
        const ban = canvas(600, 800, (g) => { g.fillStyle = "#5865f2"; g.fillRect(0, 0, 600, 800); g.fillStyle = "#fff"; g.font = "800 90px system-ui"; g.fillText("CREW", 140, 420); });
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ map: ban })); b.position.set(4.4, 4.2, -4.97); s.add(b);
        break;
      }
      case "home": {
        // A sofa, empty photo frames (your photos stay private), a plant and a warm lamp.
        this.box(2.8, 0.6, 1.1, 0x6b7280, -4.2, 0.5, 1.6); this.box(2.8, 1, 0.3, 0x6b7280, -4.2, 1, 2.2);
        for (const x of [-5.5, -2.9]) this.box(0.3, 0.8, 1.1, 0x6b7280, x, 0.6, 1.6);
        for (let i = 0; i < 4; i++) { const f = this.box(0.9, 0.7, 0.05, 0x5a4330, 2.2 + (i % 2) * 1.2, 4 + Math.floor(i / 2) * 1, -4.95); void f; this.box(0.75, 0.55, 0.06, [0xf4d6b0, 0xc7e3f0, 0xe6d3f0, 0xd4ecd0][i], 2.2 + (i % 2) * 1.2, 4 + Math.floor(i / 2) * 1, -4.93); }
        this.cyl(0.3, 0.25, 0.5, 0xb4553f, 5.6, 0.25, 3.4);
        const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), this.lam(0x4a9a5a, { flatShading: true })); plant.position.set(5.6, 0.95, 3.4); s.add(plant);
        const warm = new THREE.PointLight(0xffc27a, 12, 8); warm.position.set(-4.2, 2.5, 2.4); s.add(warm);
        break;
      }
    }
  }
}
