"use client";

// "Plugs into what you already use": a 3D orbit of the real connector logos
// around a glowing core (three.js, loaded only when scrolled into view, paused
// off screen), plus a plain list of what each connector actually does.

import { useEffect, useRef } from "react";
import {
  siClaude, siDevpost, siDiscord, siGithub, siGmail, siGooglecalendar, siItchdotio, siOpenstreetmap, siReddit, siSpotify, siStripe, siUnity, siWhatsapp, siYoutube,
} from "simple-icons";
import { SectionHead, Reveal } from "@/components/marketing/ui";

type Logo = { path: string; hex: string; title: string };
const CONNECTORS: { logo: Logo; does: string }[] = [
  { logo: siClaude, does: "Your own Claude writes briefs, devlogs and replies" },
  { logo: siGmail, does: "Email autopilot applies and answers, shadow mode first" },
  { logo: siGooglecalendar, does: "Focus and sleep plans that respect your calendar" },
  { logo: siGithub, does: "Real commits grow your game studio" },
  { logo: siStripe, does: "Payments drive into the vault" },
  { logo: siYoutube, does: "Channel stats and comment replies" },
  { logo: siSpotify, does: "Your music sets the city's mood" },
  { logo: siReddit, does: "Gig radar scouts one-time paid work" },
  { logo: siDiscord, does: "Communities worth joining, checked live" },
  { logo: siWhatsapp, does: "Outreach drafts you send yourself" },
  { logo: siOpenstreetmap, does: "Finds local businesses to pitch" },
  { logo: siUnity, does: "Your game dev pipeline" },
  { logo: siDevpost, does: "Hackathons with deadlines → tasks" },
  { logo: siItchdotio, does: "Game jams, scanned every morning" },
];

function OrbitCanvas() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dispose: (() => void) | null = null;
    let start: (() => void) | null = null;
    let stop: (() => void) | null = null;
    let running = false;
    let raf = 0;
    const io = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && !dispose) {
        const THREE = await import("three");
        const { logoTexture } = await import("@/components/empire/logo-texture");
        if (!host.current) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        camera.position.set(0, 2.2, 15);
        camera.lookAt(0, 0, 0);

        // Core: a faceted crystal with a soft orange→violet glow.
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: 0xe4e4e7, emissive: 0x6d5bd0, emissiveIntensity: 0.12, flatShading: true, metalness: 0.6, roughness: 0.3 }));
        const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 16), new THREE.MeshBasicMaterial({ color: 0xb4a5ff, transparent: true, opacity: 0.04, depthWrite: false, blending: THREE.AdditiveBlending }));
        scene.add(core, wire, halo);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const key = new THREE.PointLight(0xffffff, 60, 40); key.position.set(5, 6, 8); scene.add(key);
        const rim = new THREE.PointLight(0xb4a5ff, 35, 40); rim.position.set(-6, -3, -4); scene.add(rim);

        // Three tilted rings of logos.
        const rings = [
          { r: 4.2, tilt: 0.35, speed: 0.22, items: CONNECTORS.slice(0, 4) },
          { r: 6, tilt: -0.25, speed: -0.14, items: CONNECTORS.slice(4, 9) },
          { r: 7.8, tilt: 0.15, speed: 0.09, items: CONNECTORS.slice(9) },
        ].map((cfg) => {
          const group = new THREE.Group();
          group.rotation.x = Math.PI / 2 - 0.25 + cfg.tilt;
          const track = new THREE.Mesh(new THREE.TorusGeometry(cfg.r, 0.012, 6, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
          group.add(track);
          const sprites = cfg.items.map((c, i) => {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTexture(c.logo.path, c.logo.hex, true), transparent: true }));
            s.scale.setScalar(1.15);
            s.userData.a = (i / cfg.items.length) * Math.PI * 2;
            group.add(s);
            return s;
          });
          scene.add(group);
          return { ...cfg, group, sprites };
        });

        // Stars
        const starGeo = new THREE.BufferGeometry();
        const pts = new Float32Array(600 * 3).map(() => (Math.random() - 0.5) * 60);
        starGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.6 })));

        const mouse = { x: 0, y: 0 };
        const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width - 0.5; mouse.y = (e.clientY - r.top) / r.height - 0.5; };
        el.addEventListener("pointermove", onMove);
        const resize = () => {
          const w = el.clientWidth || 1, h = el.clientHeight || 1;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
          camera.aspect = w / h;
          camera.position.z = w / h < 1 ? 21 : 15; // portrait phones: step back so the outer ring fits
          camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize); ro.observe(el); resize();

        const clock = new THREE.Clock();
        const tick = () => {
          if (!running) return;
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
          core.rotation.y += dt * 0.4; core.rotation.x += dt * 0.15;
          wire.rotation.y -= dt * 0.2;
          halo.scale.setScalar(1 + Math.sin(t * 1.5) * 0.04);
          for (const ring of rings) for (const s of ring.sprites) {
            const a = s.userData.a + t * ring.speed;
            s.position.set(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0);
          }
          scene.rotation.y += (mouse.x * 0.6 - scene.rotation.y) * 0.04;
          scene.rotation.x += (mouse.y * 0.35 - scene.rotation.x) * 0.04;
          renderer.render(scene, camera);
        };
        start = () => { if (!running) { running = true; clock.getDelta(); tick(); } };
        stop = () => { running = false; cancelAnimationFrame(raf); };
        dispose = () => {
          stop?.(); ro.disconnect(); el.removeEventListener("pointermove", onMove);
          scene.traverse((o) => { const m = o as InstanceType<typeof THREE.Mesh>; m.geometry?.dispose(); const mat = m.material as InstanceType<typeof THREE.SpriteMaterial> | undefined; mat?.map?.dispose(); mat?.dispose(); });
          renderer.dispose(); renderer.domElement.remove();
        };
      }
      if (entry.isIntersecting) start?.(); else stop?.();
    }, { threshold: 0.05 });
    io.observe(el);
    return () => { io.disconnect(); dispose?.(); };
  }, []);
  return <div ref={host} className="absolute inset-0" aria-hidden />;
}

export function MarketingConnectors() {
  return (
    <section id="connectors" className="relative py-24 sm:py-32 px-5 sm:px-6 scroll-mt-20 overflow-hidden">
      <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHead n="02" eyebrow="Connectors" title="Plugs into what you" accent="already use." desc="Fourteen real integrations. Each one feeds a building in your city, and every connection is yours alone." />
          <Reveal delay={0.1}>
            <ul className="mt-10 grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
              {CONNECTORS.map((c) => (
                <li key={c.logo.title} className="flex items-start gap-3">
                  <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg border border-white/10 flex items-center justify-center text-white/75">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden><path d={c.logo.path} /></svg>
                  </span>
                  <span className="text-sm">
                    <span className="font-medium text-white">{c.logo.title}</span>
                    <span className="block text-white/50 text-[13px] leading-snug">{c.does}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <div className="relative aspect-square max-w-[560px] mx-auto w-full">
            <OrbitCanvas />
          </div>
        </Reveal>
      </div>
      {/* Logo marquee */}
      <div className="mt-20 relative [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max mk-marquee gap-10">
          {[...CONNECTORS, ...CONNECTORS].map((c, i) => (
            <span key={i} className="inline-flex items-center gap-2.5 text-white/45 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d={c.logo.path} /></svg>
              <span className="mk-display text-sm font-medium">{c.logo.title}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
