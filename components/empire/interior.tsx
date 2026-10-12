"use client";

// Step inside a building: a small three.js room whose monitor, cork board,
// shelf and stacks are drawn from that building's real data. The camera
// flies in through the door, then leans with your cursor.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getInteriorC, type Interior } from "@/lib/client/empire";

const THEMES: Record<Interior["theme"], { wall: number; floor: number; accent: number; pile: number; glow: string }> = {
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

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  return c;
}

export function InteriorView({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Interior | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getInteriorC(buildingId).then(setData).catch((e) => setError((e as Error).message)); }, [buildingId]);

  useEffect(() => {
    const el = host.current;
    if (!el || !data) return;
    let disposed = false;
    let cleanup = () => {};
    import("three").then((THREE) => {
      if (disposed) return;
      const t = THEMES[data.theme];
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(t.wall).multiplyScalar(0.55);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

      // Room: floor, back wall, side walls, ceiling light.
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), lambert(t.floor)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), lambert(t.wall)); back.position.set(0, 3.5, -5); back.receiveShadow = true; scene.add(back);
      for (const x of [-7, 7]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), lambert(new THREE.Color(t.wall).multiplyScalar(0.85).getHex())); side.position.set(x, 3.5, 1); side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(side); }
      const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), lambert(t.accent)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.scale.set(1.4, 1, 1); scene.add(rug);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
      const lamp = new THREE.PointLight(0xfff1d6, 60, 30, 1.6); lamp.position.set(0, 6, 1); lamp.castShadow = true; scene.add(lamp);
      const glow = new THREE.PointLight(new THREE.Color(t.glow), 18, 10, 2); glow.position.set(0, 2.4, -3.2); scene.add(glow);

      // Desk + monitor with the real data on screen.
      const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2), lambert(0x6b4f35)); desk.position.set(0, 1.5, -3.6); desk.castShadow = true; scene.add(desk);
      for (const [x, z] of [[-2.3, -4.4], [2.3, -4.4], [-2.3, -2.8], [2.3, -2.8]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), lambert(0x4a3626)); leg.position.set(x, 0.75, z); scene.add(leg); }
      const screenCanvas = canvasTex(1024, 600, (g) => {
        g.fillStyle = "#0b0f17"; g.fillRect(0, 0, 1024, 600);
        g.fillStyle = t.glow; g.font = "600 44px ui-monospace, monospace"; g.fillText(data.screen.title, 36, 70);
        g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(36, 92, 952, 2);
        g.fillStyle = "#e5e7eb"; g.font = "32px ui-monospace, monospace";
        data.screen.lines.slice(0, 9).forEach((l, i) => g.fillText(l.slice(0, 54), 36, 150 + i * 50));
      });
      const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 0.12), [lambert(0x111111), lambert(0x111111), lambert(0x111111), lambert(0x111111), new THREE.MeshBasicMaterial({ map: screenTex }), lambert(0x111111)]);
      monitor.position.set(0, 2.85, -4); monitor.castShadow = true; scene.add(monitor);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), lambert(0x222222)); stand.position.set(0, 1.95, -4.05); scene.add(stand);

      // Cork board with pinned notes (if there are any).
      if (data.board.length) {
        const boardCanvas = canvasTex(800, 520, (g) => {
          g.fillStyle = "#b5895a"; g.fillRect(0, 0, 800, 520);
          const colors = ["#fff59d", "#a5f3fc", "#fbcfe8", "#bbf7d0", "#fde68a"];
          data.board.slice(0, 5).forEach((note, i) => {
            const x = 30 + (i % 3) * 255, y = 30 + Math.floor(i / 3) * 245;
            g.save(); g.translate(x + 110, y + 100); g.rotate((i % 2 ? 1 : -1) * 0.04); g.translate(-(x + 110), -(y + 100));
            g.fillStyle = colors[i % colors.length]; g.fillRect(x, y, 225, 215);
            g.fillStyle = "#c0392b"; g.beginPath(); g.arc(x + 112, y + 14, 8, 0, Math.PI * 2); g.fill();
            g.fillStyle = "#1f2937"; g.font = "22px system-ui, sans-serif";
            const words = note.split(" "); let line = "", ly = y + 50;
            for (const w of words) { if ((line + w).length > 18) { g.fillText(line, x + 14, ly); line = ""; ly += 28; if (ly > y + 200) break; } line += `${w} `; }
            if (ly <= y + 200) g.fillText(line, x + 14, ly);
            g.restore();
          });
        });
        const bt = new THREE.CanvasTexture(boardCanvas); bt.colorSpace = THREE.SRGBColorSpace;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshLambertMaterial({ map: bt }));
        board.position.set(-6.95, 3.4, -1); board.rotation.y = Math.PI / 2; scene.add(board);
      }

      // Shelf plaque with stats.
      if (data.shelf.length) {
        const shelfCanvas = canvasTex(700, 300, (g) => {
          g.fillStyle = "#1c1f26"; g.fillRect(0, 0, 700, 300);
          data.shelf.slice(0, 3).forEach((s, i) => {
            g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "26px system-ui, sans-serif"; g.fillText(s.label, 30, 60 + i * 90);
            g.fillStyle = t.glow; g.font = "700 40px system-ui, sans-serif"; g.fillText(s.value, 30, 104 + i * 90);
          });
        });
        const st = new THREE.CanvasTexture(shelfCanvas); st.colorSpace = THREE.SRGBColorSpace;
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3), new THREE.MeshBasicMaterial({ map: st }));
        plaque.position.set(6.95, 3.6, -1); plaque.rotation.y = -Math.PI / 2; scene.add(plaque);
      }

      // Stacks: gold bars in the vault, books in the library, crates elsewhere — the count is real.
      if (data.piles > 0) {
        const geo = data.theme === "library" ? new THREE.BoxGeometry(0.3, 1, 0.75) : new THREE.BoxGeometry(0.8, 0.3, 0.42);
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: t.pile, emissive: data.theme === "vault" ? 0x5a3c00 : 0x000000, emissiveIntensity: 0.4 }), data.piles);
        const o = new THREE.Object3D();
        for (let i = 0; i < data.piles; i++) {
          if (data.theme === "library") { o.position.set(3 + (i % 12) * 0.32, 1.1 + Math.floor(i / 12) * 1.15, -4.6); o.rotation.set(0, 0, (i % 5 === 0 ? 0.12 : 0)); }
          else { const layer = Math.floor(i / 8); o.position.set(3.2 + ((i % 8) % 4) * 0.84, 0.15 + layer * 0.31, 1.4 + Math.floor((i % 8) / 4) * 0.46); o.rotation.set(0, 0, 0); }
          o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
        }
        mesh.castShadow = true;
        scene.add(mesh);
      }

      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
        camera.aspect = w / h; camera.fov = w / h < 1 ? 68 : 50; camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();
      const mouse = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width - 0.5; mouse.y = (e.clientY - r.top) / r.height - 0.5; };
      el.addEventListener("pointermove", onMove);

      const start = performance.now();
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const k = Math.min(1, (performance.now() - start) / 1400);
        const e = 1 - Math.pow(1 - k, 3); // ease-out: fly in through the door
        camera.position.set(mouse.x * 1.4, 3.1 - mouse.y * 0.6 + (1 - e) * 1.5, 13 - e * 6.5);
        camera.lookAt(mouse.x * 0.6, 2.4, -3.5);
        renderer.render(scene, camera);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); el.removeEventListener("pointermove", onMove);
        scene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as InstanceType<typeof THREE.MeshBasicMaterial>[]) { mat.map?.dispose(); mat.dispose(); }
        });
        renderer.dispose(); renderer.domElement.remove();
      };
    });
    return () => { disposed = true; cleanup(); };
  }, [data]);

  return (
    <div className="absolute inset-0 z-40 bg-black animate-in fade-in-0 duration-500">
      <div ref={host} className="absolute inset-0" />
      {!data && !error && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {error && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">{error}</div>}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-2">
        <button onClick={onClose} className="h-10 px-3 rounded-xl bg-black/60 text-white backdrop-blur-md inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="w-4 h-4" /> Back to the city</button>
        {data && <span className="h-10 px-3 rounded-xl bg-black/60 text-white backdrop-blur-md inline-flex items-center font-hud uppercase tracking-wide">{data.title}</span>}
      </div>
    </div>
  );
}
