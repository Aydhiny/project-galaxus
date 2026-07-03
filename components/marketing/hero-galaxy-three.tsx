"use client";

import { useEffect, useRef, useState } from "react";

/*
  Hero background — a slowly rotating galaxy of additive-blended points,
  following the same dynamic-import + manual WebGLRenderer + cleanup
  pattern as components/ambient-three.tsx. Scoped to the hero section only
  (absolutely positioned within its own relative container, not fixed).
*/
export function HeroGalaxyThree() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    let animId = 0;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const T = await import("three");
      const el = mountRef.current;
      if (disposed || !el) return;

      const W = el.clientWidth;
      const H = el.clientHeight;

      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H, false);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      Object.assign(renderer.domElement.style, {
        position: "absolute", inset: "0", width: "100%", height: "100%",
      });
      el.appendChild(renderer.domElement);

      const scene = new T.Scene();
      const cam = new T.PerspectiveCamera(60, W / H, 0.1, 100);
      cam.position.z = 22;

      // ── Galaxy: two intermixed spiral arms of points ─────────────────────
      const COUNT = 2600;
      const positions = new Float32Array(COUNT * 3);
      const colors = new Float32Array(COUNT * 3);
      const sizes = new Float32Array(COUNT);

      const palette = [
        new T.Color("#173eff"),
        new T.Color("#4f46e5"),
        new T.Color("#818cf8"),
        new T.Color("#a78bfa"),
        new T.Color("#ffffff"),
      ];

      for (let i = 0; i < COUNT; i++) {
        const arm = i % 2;
        const t = Math.random();
        const radius = 2 + t * 16;
        const angle = radius * 0.55 + arm * Math.PI + (Math.random() - 0.5) * 0.6;
        const spread = (1 - t) * 2.2 + 0.3;

        const x = Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
        const y = (Math.random() - 0.5) * spread * 1.6;
        const z = Math.sin(angle) * radius + (Math.random() - 0.5) * spread;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        const c = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        sizes[i] = 0.4 + Math.random() * (t < 0.15 ? 1.6 : 0.7);
      }

      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(positions, 3));
      geo.setAttribute("color", new T.BufferAttribute(colors, 3));
      geo.setAttribute("size", new T.BufferAttribute(sizes, 1));

      const mat = new T.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
      });

      const points = new T.Points(geo, mat);
      points.rotation.x = 0.35;
      scene.add(points);

      let targetRotX = 0.35, targetRotY = 0;
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        targetRotY = nx * 0.35;
        targetRotX = 0.35 + ny * 0.15;
      };
      el.addEventListener("mousemove", onMove);

      const tick = () => {
        animId = requestAnimationFrame(tick);
        points.rotation.y += 0.0009;
        points.rotation.y += (targetRotY - 0) * 0.0002;
        points.rotation.x += (targetRotX - points.rotation.x) * 0.02;
        renderer.render(scene, cam);
      };
      tick();

      const onResize = () => {
        const nW = el.clientWidth, nH = el.clientHeight;
        renderer.setSize(nW, nH, false);
        cam.aspect = nW / nH;
        cam.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        el.removeEventListener("mousemove", onMove);
        cancelAnimationFrame(animId);
        renderer.dispose();
        geo.dispose(); mat.dispose();
        renderer.domElement.remove();
      };
    };

    init();
    return () => { disposed = true; cancelAnimationFrame(animId); cleanup?.(); };
  }, [mounted]);

  return <div ref={mountRef} className="absolute inset-0 overflow-hidden" aria-hidden="true" />;
}
