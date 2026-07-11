"use client";

import { useRef, useEffect, useState } from "react";
import { useAmbientStore } from "@/lib/store/ambient";

/*
  Three.js ambient particle layer — z=41, above CSS tint (z=40), below UI (z=50+)
  Fire: ~700 additive-blended points rising from screen bottom-center
  Rain: ~1400 LineSegments with diagonal streaks
  Volume refs are updated each frame so the animation loop always reads current values.
*/

export function AmbientThree() {
  const mountRef   = useRef<HTMLDivElement>(null);
  const rainVolRef = useRef(0);
  const fireVolRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  const rainVol = useAmbientStore(s => s.rainVol);
  const fireVol = useAmbientStore(s => s.fireVol);
  useEffect(() => { rainVolRef.current = rainVol / 100; }, [rainVol]);
  useEffect(() => { fireVolRef.current = fireVol / 100; }, [fireVol]);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Skip Three.js entirely when no ambient sound is active — saves significant GPU.
    // Also skip when the OS "reduce motion" preference is on — this loop is purely
    // decorative and has no functional purpose beyond visual ambience.
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mounted || reducedMotion || (rainVol === 0 && fireVol === 0)) return;
    let animId = 0;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const T = await import("three");
      if (disposed || !mountRef.current) return;

      const W = window.innerWidth;
      const H = window.innerHeight;

      const renderer = new T.WebGLRenderer({ antialias: false, alpha: true });
      renderer.setSize(W, H, false);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      Object.assign(renderer.domElement.style, {
        position: "fixed", inset: "0", width: "100%", height: "100%",
        pointerEvents: "none", zIndex: "41",
      });
      mountRef.current.appendChild(renderer.domElement);

      const scene = new T.Scene();
      const cam = new T.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
      cam.position.z = 5;

      // ── FIRE ─────────────────────────────────────────────────────────────
      const FC = 700;
      const fPos = new Float32Array(FC * 3);
      const fCol = new Float32Array(FC * 3);
      const fSz  = new Float32Array(FC);
      const fLife = new Float32Array(FC);
      const fVX  = new Float32Array(FC);
      const fVY  = new Float32Array(FC);

      const spawnFire = (i: number) => {
        // Spread across ~30% of viewport width, centered
        const spread = Math.min(W * 0.28, 340);
        fPos[i*3]   = (Math.random() - 0.5) * spread;
        fPos[i*3+1] = -H / 2 + Math.random() * H * 0.06;
        fPos[i*3+2] = 0;
        fVX[i]  = (Math.random() - 0.5) * 1.6;
        fVY[i]  = 2.2 + Math.random() * 3.8;
        fLife[i] = Math.random(); // stagger starts
        fSz[i]  = 10 + Math.random() * 22;
      };
      for (let i = 0; i < FC; i++) spawnFire(i);

      const fGeo = new T.BufferGeometry();
      fGeo.setAttribute("position", new T.BufferAttribute(fPos, 3));
      fGeo.setAttribute("color",    new T.BufferAttribute(fCol, 3));
      fGeo.setAttribute("size",     new T.BufferAttribute(fSz, 1));

      const fMat = new T.PointsMaterial({
        vertexColors: true, transparent: true, opacity: 0,
        sizeAttenuation: false, blending: T.AdditiveBlending, depthWrite: false, size: 14,
      });
      const firePoints = new T.Points(fGeo, fMat);
      scene.add(firePoints);

      // ── RAIN ──────────────────────────────────────────────────────────────
      const RC = 1400;
      // LineSegments: each drop = 2 verts (top & bottom of streak)
      const rPos = new Float32Array(RC * 6);
      const rVelY = new Float32Array(RC);

      const spawnRain = (i: number, anyY = false) => {
        const x = (Math.random() - 0.5) * W * 1.5;
        const y = anyY ? (Math.random() - 0.5) * H : H / 2 + 30;
        const len = 10 + Math.random() * 18;
        // top
        rPos[i*6]   = x;      rPos[i*6+1] = y;       rPos[i*6+2] = 0;
        // bottom (slight leftward drift for angle)
        rPos[i*6+3] = x - 3;  rPos[i*6+4] = y - len; rPos[i*6+5] = 0;
        rVelY[i] = -(5 + Math.random() * 6);
      };
      for (let i = 0; i < RC; i++) spawnRain(i, true);

      const rGeo = new T.BufferGeometry();
      rGeo.setAttribute("position", new T.BufferAttribute(rPos, 3));

      const rMat = new T.LineBasicMaterial({
        color: new T.Color(0.58, 0.74, 0.90),
        transparent: true, opacity: 0,
      });
      const rainLines = new T.LineSegments(rGeo, rMat);
      scene.add(rainLines);

      // ── ANIMATION ─────────────────────────────────────────────────────────
      const col = new T.Color();

      const tick = () => {
        animId = requestAnimationFrame(tick);
        const rv = rainVolRef.current;
        const fv = fireVolRef.current;

        // ── fire particles ──
        fMat.opacity = Math.min(fv * 0.92, 0.92);
        if (fv > 0) {
          for (let i = 0; i < FC; i++) {
            fLife[i] += 0.008 + Math.random() * 0.006;
            if (fLife[i] >= 1.0) { spawnFire(i); fLife[i] = 0; continue; }

            // horizontal turbulence
            fVX[i] += (Math.random() - 0.5) * 0.22;
            fVX[i] *= 0.975;

            fPos[i*3]   += fVX[i];
            fPos[i*3+1] += fVY[i] * (0.35 + (1 - fLife[i]) * 2.2);

            // color: deep crimson → orange → yellow → fade
            const t = fLife[i];
            if      (t < 0.30) col.setHSL(0.030 + t * 0.04, 1.0, 0.25 + t * 1.60);
            else if (t < 0.60) col.setHSL(0.075 + (t-0.30)*0.15, 1.0, 0.72 + (t-0.30)*0.55);
            else               col.setHSL(0.130, 0.85, Math.max(0, 1.0 - (t-0.60)*3.0));
            fCol[i*3]=col.r; fCol[i*3+1]=col.g; fCol[i*3+2]=col.b;

            fSz[i] = Math.max(0.5, (1 - t * 1.05) * (9 + Math.random() * 20));
          }
          fGeo.attributes.position.needsUpdate = true;
          fGeo.attributes.color.needsUpdate = true;
          fGeo.attributes.size.needsUpdate = true;
        }

        // ── rain streaks ──
        rMat.opacity = Math.min(rv * 0.62, 0.62);
        if (rv > 0) {
          for (let i = 0; i < RC; i++) {
            const dy = rVelY[i];
            const dx = dy * 0.12; // angle
            rPos[i*6]   += dx; rPos[i*6+1] += dy;
            rPos[i*6+3] += dx; rPos[i*6+4] += dy;
            if (rPos[i*6+4] < -H / 2 - 30) spawnRain(i, false);
          }
          rGeo.attributes.position.needsUpdate = true;
        }

        renderer.render(scene, cam);
      };
      tick();

      // Resize handler
      const onResize = () => {
        const nW = window.innerWidth, nH = window.innerHeight;
        renderer.setSize(nW, nH, false);
        cam.left = -nW / 2;   cam.right = nW / 2;
        cam.top  =  nH / 2;   cam.bottom = -nH / 2;
        cam.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(animId);
        renderer.dispose();
        fGeo.dispose(); fMat.dispose();
        rGeo.dispose(); rMat.dispose();
        renderer.domElement.remove();
      };
    };

    init();
    return () => { disposed = true; cancelAnimationFrame(animId); cleanup?.(); };
  }, [mounted]);

  if (!mounted) return null;
  return <div ref={mountRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 41 }} />;
}
