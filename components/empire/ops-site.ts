// The agent facility, out past the city walls: a fenced bunker with a radar
// dome, a comms mast and a helipad, joined to the ring road by its own access
// road. It reflects the real crew (World.ops): the mast light is green while
// agents work and pulses red when one needs you; tiny agents walk the yard
// while work is happening. Clicking it opens /ops.

import * as THREE from "three";

export const OPS_SITE_ID = "ops";
const POS = new THREE.Vector3(-41, 0, -41); // ~58 units out: away from the base, behind the default camera's view of HQ
const RING_OUTER = 31;

type Walker = { mesh: THREE.Group; a: number; r: number; v: number };

export class OpsSite {
  readonly group = new THREE.Group();
  readonly top = 9.5; // label height
  private dish = new THREE.Group();
  private beacon: THREE.Mesh;
  private beaconMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
  private fenceMat = new THREE.MeshBasicMaterial({ color: 0x6b8afd, transparent: true, opacity: 0.5 });
  private stripeMat = new THREE.MeshBasicMaterial({ color: 0x6b8afd });
  private walkers: Walker[] = [];
  private state = { agents: 0, working: 0, waiting: 0 };

  constructor() {
    const g = this.group;
    g.position.copy(POS);
    g.rotation.y = Math.atan2(POS.x, POS.z) + Math.PI; // the gate faces the city
    const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = true; m.userData.buildingId = OPS_SITE_ID; g.add(m); return m; };

    // Concrete yard + fence (posts and a thin laser line in Galaxus blue).
    const yard = new THREE.Mesh(new THREE.CircleGeometry(10.5, 40), lam(0x5b636e));
    yard.rotation.x = -Math.PI / 2; yard.position.y = 0.03; yard.receiveShadow = true; yard.userData.buildingId = OPS_SITE_ID; g.add(yard);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), lam(0x2c3138), 36);
    const o = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const gate = Math.abs(Math.sin(a / 2)) < 0.09; // leave the gate open (a = 0 faces the road)
      o.position.set(Math.sin(a) * 10.5, gate ? -5 : 0.8, Math.cos(a) * 10.5); o.updateMatrix(); posts.setMatrixAt(i, o.matrix);
    }
    g.add(posts);
    const laser = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.04, 4, 72, Math.PI * 2 - 0.6), this.fenceMat);
    laser.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3); laser.position.y = 1.4; g.add(laser);

    // The bunker: low, angled, dark, with a blue stripe and a blast door.
    add(new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 6.5), lam(0x2b3440)), 0, 1.6, -2.2);
    const slope = add(new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 3.2), lam(0x343e4c)), 0, 2.6, 1.3);
    slope.rotation.x = -0.45;
    add(new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.22, 0.1), this.stripeMat), 0, 2.4, 1.06);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 0.15), lam(0x1a1f27)), 0, 1, 1.0);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.17), this.stripeMat), 0, 1.4, 1.05);

    // Radar dome + rotating dish on the roof.
    const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe9edf2)), -2.6, 3.2, -3.2);
    dome.userData.buildingId = OPS_SITE_ID;
    this.dish.position.set(2.6, 3.2, -3.5); g.add(this.dish);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshLambertMaterial({ color: 0xd1d5db, side: THREE.DoubleSide }));
    dish.rotation.x = -Math.PI / 2.4; dish.position.y = 1.2; dish.userData.buildingId = OPS_SITE_ID; this.dish.add(dish);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), lam(0x4b5563)); stalk.position.y = 0.6; stalk.userData.buildingId = OPS_SITE_ID; this.dish.add(stalk);

    // Comms mast with the status beacon.
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 6, 6), lam(0x9ca3af)), 3.8, 6.2, -1.2);
    this.beacon = add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), this.beaconMat), 3.8, 9.3, -1.2);

    // Helipad.
    const pc = document.createElement("canvas"); pc.width = pc.height = 128;
    const pg = pc.getContext("2d")!;
    pg.fillStyle = "#3a414b"; pg.beginPath(); pg.arc(64, 64, 62, 0, Math.PI * 2); pg.fill();
    pg.strokeStyle = "#facc15"; pg.lineWidth = 5; pg.beginPath(); pg.arc(64, 64, 52, 0, Math.PI * 2); pg.stroke();
    pg.fillStyle = "#f8fafc"; pg.font = "bold 64px system-ui, sans-serif"; pg.textAlign = "center"; pg.textBaseline = "middle"; pg.fillText("H", 64, 68);
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshLambertMaterial({ map: pt }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-5.6, 0.06, 4.2); pad.userData.buildingId = OPS_SITE_ID; g.add(pad);

    // Tiny agents in the yard (shown only while someone works).
    const body = new THREE.CapsuleGeometry(0.22, 0.35, 4, 8);
    const head = new THREE.SphereGeometry(0.24, 10, 8);
    const suit = [0x111827, 0x1f2937, 0x0f766e, 0x334155];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Group();
      const b = new THREE.Mesh(body, lam(suit[i % suit.length])); b.position.y = 0.45; m.add(b);
      const hd = new THREE.Mesh(head, lam(0xffd9b8)); hd.position.y = 1.0; m.add(hd);
      const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), lam(0x0b0b0b)); glasses.position.set(0, 1.03, 0.21); m.add(glasses); // agents wear shades
      m.visible = false;
      g.add(m);
      this.walkers.push({ mesh: m, a: (i / 6) * Math.PI * 2, r: 5.2 + (i % 3) * 1.1, v: (0.25 + (i % 4) * 0.07) * (i % 2 ? 1 : -1) });
    }
  }

  /** The access road from the ring road to the gate, added to the scene once. */
  road(): THREE.Mesh {
    const from = RING_OUTER + 1.5, to = POS.length() - 10.5;
    const len = to - from;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), new THREE.MeshLambertMaterial({ color: 0x3c4148 }));
    const a = Math.atan2(POS.z, POS.x);
    road.rotation.set(-Math.PI / 2, 0, -a);
    road.position.set(Math.cos(a) * (from + len / 2), 0.03, Math.sin(a) * (from + len / 2));
    road.receiveShadow = true;
    return road;
  }

  set(ops: { agents: number; working: number; waiting: number } | null | undefined) {
    this.state = ops ?? { agents: 0, working: 0, waiting: 0 };
    this.walkers.forEach((w, i) => { w.mesh.visible = i < Math.min(6, this.state.working); });
  }

  tick(t: number, dt: number) {
    const { agents, working, waiting } = this.state;
    this.dish.rotation.y += dt * (working ? 1.4 : 0.25);
    const pulse = 0.5 + 0.5 * Math.sin(t * (waiting ? 7 : 3));
    this.beaconMat.color.setHex(waiting ? 0xf43f5e : working ? 0x34d399 : agents ? 0xfbbf24 : 0x64748b);
    this.beacon.scale.setScalar(waiting || working ? 0.8 + pulse * 0.6 : 1);
    this.fenceMat.opacity = 0.25 + (working ? 0.35 * pulse : 0.1);
    this.stripeMat.color.setHex(waiting ? 0xf43f5e : 0x6b8afd);
    for (const w of this.walkers) {
      if (!w.mesh.visible) continue;
      w.a += w.v * dt;
      // An ellipse across the front yard (the bunker sits behind z ≈ 2).
      w.mesh.position.set(Math.sin(w.a) * w.r, Math.abs(Math.sin(t * 8 + w.r)) * 0.05, 5 + Math.cos(w.a) * w.r * 0.4);
      const s = Math.sign(w.v);
      w.mesh.rotation.y = Math.atan2(Math.cos(w.a) * s, -Math.sin(w.a) * 0.4 * s); // face where they walk
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as (THREE.Material & { map?: THREE.Texture | null })[];
      for (const mat of mats) { mat.map?.dispose(); mat.dispose(); }
    });
  }
}
