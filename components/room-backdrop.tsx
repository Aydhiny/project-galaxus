"use client";

import { useEffect, useState } from "react";
import { useRoomStore } from "@/lib/store/room";
import { useAmbientStore } from "@/lib/store/ambient";
import type { Decorations } from "@/lib/store/room";

/* ─────────────────────────────────────────────────────────────────────────────
   Architecture
   ─────────────────────────────────────────────────────────────────────────────
   Two wrapper divs, both position:fixed inset:0 pointer-events:none:
     • BG layer  z=2  — floor, ceiling, walls, large shapes, vignette
     • FG layer  z=28 — candles, window, plants, artwork (float OVER content)
   Content sits at z=10; ambient overlay at z=40; Three.js at z=41.
   Children use position:absolute, which is identical to fixed since
   parent already spans the full viewport.
   ──────────────────────────────────────────────────────────────────────────── */

// ─── Shared reusable atoms ─────────────────────────────────────────────────

function Candle({ left, bottom }: { left: string | number; bottom: string | number }) {
  return (
    <div style={{ position: "absolute", left, bottom, width: 20, pointerEvents: "none" }}>
      {/* flame */}
      <div style={{
        width: 9, height: 15, margin: "0 auto",
        borderRadius: "50% 50% 30% 30% / 60% 60% 40% 40%",
        background: "radial-gradient(ellipse at 50% 80%, oklch(0.94 0.22 56), oklch(0.74 0.24 38) 55%, transparent 82%)",
        filter: "blur(0.5px)",
        animation: "candle-flicker 2.4s ease-in-out infinite",
        position: "relative", zIndex: 1,
      }} />
      {/* halo glow */}
      <div style={{
        position: "absolute", top: -10, left: -14,
        width: 38, height: 34, borderRadius: "50%",
        background: "radial-gradient(ellipse at 50% 60%, oklch(0.80 0.24 50 / 35%), transparent 70%)",
        animation: "candle-glow 2.4s ease-in-out infinite",
      }} />
      {/* body */}
      <div style={{
        width: 10, height: 46, margin: "-1px auto 0",
        borderRadius: "2px 2px 0 0",
        background: "linear-gradient(180deg, oklch(0.93 0.04 76), oklch(0.82 0.06 72))",
        boxShadow: "inset -2px 0 4px oklch(0 0 0 / 15%)",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 7, right: -1, width: 4, height: 11, borderRadius: "0 0 50% 50%", background: "oklch(0.91 0.04 76)", opacity: 0.7 }} />
      </div>
      <div style={{ width: 16, height: 5, margin: "0 auto", borderRadius: "2px", background: "linear-gradient(180deg, oklch(0.64 0.10 55), oklch(0.50 0.08 52))" }} />
    </div>
  );
}

function WindowFrame({ rainVol, fireVol, theme }: { rainVol: number; fireVol: number; theme: string }) {
  const stars = [[18,22],[35,12],[55,28],[72,10],[88,20],[10,45],[42,38],[63,15],[80,42],[25,55],[50,8],[92,35]];
  const isLofi = theme === "lofi";
  const sky = isLofi
    ? "radial-gradient(ellipse at 30% 0%, oklch(0.28 0.12 285), oklch(0.14 0.09 270) 60%, oklch(0.10 0.06 260))"
    : "radial-gradient(ellipse at 40% 10%, oklch(0.22 0.07 268), oklch(0.10 0.05 250) 70%)";
  return (
    <div style={{ width: 108, height: 138, borderRadius: "6px 6px 0 0", overflow: "hidden", position: "relative",
      boxShadow: "inset 0 0 0 4px oklch(0.28 0.06 48), inset 0 0 0 7px oklch(0.18 0.04 44), 0 4px 24px oklch(0 0 0 / 40%)" }}>
      <div style={{ position: "absolute", inset: 0, background: sky }} />
      {/* city glow for lofi */}
      {isLofi && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(0deg, oklch(0.24 0.10 290 / 70%), transparent)" }} />}
      {/* stars */}
      {rainVol === 0 && stars.map(([x, y], i) => (
        <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: i%3===0?2:1.5, height: i%3===0?2:1.5, borderRadius: "50%", background: "oklch(0.92 0.04 80)", opacity: 0.7+(i%3)*0.15, animation: `star-twinkle ${1.8+(i*0.3)%2}s ease-in-out ${(i*0.4)%3}s infinite` }} />
      ))}
      {/* rain on glass */}
      {rainVol > 0 && Array.from({length:8},(_,i) => (
        <div key={i} style={{ position:"absolute", left:`${10+i*12}%`, top:0, width:1, height:18+(i%3)*12, background:"linear-gradient(180deg,transparent,oklch(0.72 0.06 215/70%))", borderRadius:"0 0 2px 2px", animation:`window-rain ${0.6+(i*0.1)%0.5}s linear ${(i*0.15)%0.8}s infinite` }} />
      ))}
      {/* fire warmth */}
      {fireVol > 0 && <div style={{ position:"absolute",inset:0, background:`radial-gradient(ellipse at 50% 110%, oklch(0.60 0.22 38 / ${fireVol/200}), transparent 70%)` }} />}
      {/* cross frame */}
      <div style={{ position:"absolute",inset:0, backgroundImage:"linear-gradient(oklch(0.26 0.05 46/80%) 0px,oklch(0.26 0.05 46/80%) 4px,transparent 4px),linear-gradient(90deg,oklch(0.26 0.05 46/80%) 0px,oklch(0.26 0.05 46/80%) 4px,transparent 4px)", backgroundPosition:"50% 0,0 50%", backgroundSize:"4px 100%,100% 4px", backgroundRepeat:"no-repeat" }} />
      {/* glass sheen */}
      <div style={{ position:"absolute",inset:0, background:"linear-gradient(135deg,oklch(1 0 0/5%) 0%,transparent 50%,oklch(1 0 0/2%) 100%)" }} />
      {/* sill */}
      <div style={{ position:"absolute",bottom:-8,left:-4,right:-4,height:10, background:"linear-gradient(180deg,oklch(0.32 0.06 48),oklch(0.22 0.04 44))", borderRadius:"0 0 3px 3px" }} />
    </div>
  );
}

// ─── Cabin ─────────────────────────────────────────────────────────────────

function getCabinLayers(dec: Decorations, rainVol: number, fireVol: number) {
  const bg = (
    <>
      {/* Wooden floor planks */}
      <div style={{ position:"absolute",bottom:0,left:0,right:0,height:"14%",
        background:`repeating-linear-gradient(90deg,oklch(0.16 0.04 38/60%) 0px,oklch(0.16 0.04 38/60%) 1px,transparent 1px,transparent 72px),linear-gradient(0deg,oklch(0.12 0.04 36/70%),transparent)` }} />
      {/* Ceiling beam texture */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:"8%",
        background:`repeating-linear-gradient(90deg,oklch(0.14 0.03 36/50%) 0px,oklch(0.14 0.03 36/50%) 2px,transparent 2px,transparent 120px),linear-gradient(180deg,oklch(0.08 0.02 36/80%),transparent)` }} />
      {/* Left wall panel */}
      <div style={{ position:"absolute",top:0,left:0,bottom:0,width:"2.5%",
        background:`repeating-linear-gradient(180deg,oklch(0.14 0.03 38/40%) 0px,oklch(0.14 0.03 38/40%) 1px,transparent 1px,transparent 60px),linear-gradient(90deg,oklch(0.10 0.03 36/70%),transparent)` }} />
      {/* Right wall panel */}
      <div style={{ position:"absolute",top:0,right:0,bottom:0,width:"2.5%",
        background:`repeating-linear-gradient(180deg,oklch(0.14 0.03 38/40%) 0px,oklch(0.14 0.03 38/40%) 1px,transparent 1px,transparent 60px),linear-gradient(270deg,oklch(0.10 0.03 36/70%),transparent)` }} />
      {/* Fireplace hearth */}
      <div style={{ position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:180,height:100,opacity:0.65 }}>
        <svg viewBox="0 0 180 100" style={{ width:"100%",height:"100%",display:"block" }}>
          <rect x="0" y="10" width="180" height="90" rx="2" fill="oklch(0.16 0.04 38)" />
          <rect x="-10" y="6" width="200" height="12" rx="2" fill="oklch(0.22 0.05 42)" />
          <path d="M40,100 L40,50 Q90,14 140,50 L140,100 Z" fill="oklch(0.09 0.04 25)" />
          <line x1="0" y1="28" x2="40" y2="28" stroke="oklch(0.20 0.04 40)" strokeWidth="1" opacity="0.5" />
          <line x1="140" y1="28" x2="180" y2="28" stroke="oklch(0.20 0.04 40)" strokeWidth="1" opacity="0.5" />
          {fireVol > 0 && <ellipse cx="90" cy="95" rx="36" ry="10" fill={`oklch(0.68 0.22 35 / ${fireVol/140})`} style={{filter:"blur(6px)"}} />}
        </svg>
      </div>
      {/* Rug */}
      <div style={{ position:"absolute",bottom:0,left:"20%",right:"20%",height:"5%",opacity:0.18, borderRadius:"4px 4px 0 0",
        background:`repeating-linear-gradient(90deg,oklch(0.62 0.16 38/60%) 0px,oklch(0.62 0.16 38/60%) 8px,oklch(0.50 0.14 48/40%) 8px,oklch(0.50 0.14 48/40%) 16px)` }} />
      {/* Vignette */}
      <div style={{ position:"absolute",inset:0, background:"radial-gradient(ellipse 85% 85% at 50% 50%, transparent 45%, oklch(0 0 0 / 55%) 100%)" }} />
    </>
  );

  const fg = (
    <>
      {dec.candles && <Candle left="calc(50% - 90px)" bottom="calc(5% + 62px)" />}
      {dec.candles && <Candle left="calc(50% + 64px)" bottom="calc(5% + 62px)" />}

      {dec.window && (
        <div style={{ position:"absolute",top:"8%",right:"3.5%" }}>
          <WindowFrame rainVol={rainVol} fireVol={fireVol} theme="cabin" />
          {/* curtains */}
          <div style={{ position:"absolute",inset:-2,pointerEvents:"none",
            background:"linear-gradient(90deg,oklch(0.38 0.08 42/85%) 0%,transparent 28%),linear-gradient(270deg,oklch(0.38 0.08 42/85%) 0%,transparent 28%)" }} />
        </div>
      )}

      {dec.plants && (
        <div style={{ position:"absolute",bottom:"12%",left:"3%",opacity:0.55 }}>
          <svg viewBox="0 0 36 72" style={{ width:36,height:72,display:"block" }}>
            <rect x="0" y="34" width="36" height="5" fill="oklch(0.26 0.05 44)" rx="1" />
            <rect x="0" y="70" width="36" height="5" fill="oklch(0.26 0.05 44)" rx="1" />
            {[{x:2,w:7,h:26,c:"oklch(0.42 0.14 28)"},{x:10,w:5,h:22,c:"oklch(0.55 0.16 50)"},{x:16,w:8,h:28,c:"oklch(0.40 0.12 155)"},{x:25,w:6,h:20,c:"oklch(0.50 0.14 260)"},{x:32,w:4,h:24,c:"oklch(0.46 0.14 38)"}].map((b,i)=>(<rect key={i} x={b.x} y={34-b.h} width={b.w} height={b.h} fill={b.c} rx="0.5" />))}
            {[{x:1,w:6,h:24,c:"oklch(0.52 0.16 36)"},{x:8,w:9,h:30,c:"oklch(0.44 0.12 78)"},{x:18,w:5,h:20,c:"oklch(0.56 0.18 155)"},{x:24,w:7,h:26,c:"oklch(0.48 0.15 268)"},{x:32,w:4,h:22,c:"oklch(0.54 0.14 45)"}].map((b,i)=>(<rect key={i} x={b.x} y={70-b.h} width={b.w} height={b.h} fill={b.c} rx="0.5" />))}
          </svg>
        </div>
      )}

      {dec.artwork && (
        <div style={{ position:"absolute",top:"28%",right:"3%",opacity:0.55 }}>
          <svg viewBox="0 0 56 68" style={{ width:56,height:68,display:"block" }}>
            <rect x="0" y="0" width="56" height="68" rx="2" fill="oklch(0.28 0.06 46)" />
            <rect x="4" y="4" width="48" height="60" rx="1" fill="oklch(0.22 0.04 44)" />
            <rect x="5" y="5" width="46" height="58" fill="oklch(0.16 0.06 260)" />
            <ellipse cx="28" cy="20" rx="20" ry="8" fill="oklch(0.38 0.10 48)" opacity="0.6" />
            <polygon points="10,63 28,25 46,63" fill="oklch(0.14 0.04 200)" />
            <polygon points="18,63 28,35 38,63" fill="oklch(0.16 0.05 210)" />
            <ellipse cx="28" cy="14" rx="10" ry="6" fill="oklch(0.62 0.16 50)" opacity="0.4" />
          </svg>
        </div>
      )}
    </>
  );
  return { bg, fg };
}

// ─── Bamboo ────────────────────────────────────────────────────────────────

function getBambooLayers(dec: Decorations, rainVol: number) {
  const BambooPatch = ({ side }: { side: "left"|"right" }) => (
    <div style={{ position:"absolute",[side]:0,top:0,bottom:0,width:"5.5%",opacity:0.55 }}>
      <svg viewBox="0 0 44 600" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="none">
        {(side==="left"?[[4,0.85],[15,1.0],[28,0.9],[40,0.75]] as const:[[4,0.7],[16,1.0],[30,0.85],[42,0.7]] as const).map(([cx,op],idx)=>(
          <g key={idx} opacity={op}>
            {Array.from({length:12},(_,i)=>(
              <g key={i}>
                <rect x={cx-3} y={i*50} width={6} height={48} fill={`oklch(${0.30+idx*0.04} 0.13 ${148+idx*5})`} rx="1" />
                <rect x={cx-4} y={i*50+46} width={8} height={4} fill={`oklch(${0.23+idx*0.04} 0.10 150)`} rx="1" />
                {i%3===0 && <path d={`M${cx+3},${i*50+20} Q${cx+18},${i*50+14} ${cx+24},${i*50+28} Q${cx+12},${i*50+32} ${cx+3},${i*50+20}`} fill={`oklch(${0.38+idx*0.04} 0.16 148)`} />}
                {i%3===1 && <path d={`M${cx-3},${i*50+30} Q${cx-18},${i*50+24} ${cx-24},${i*50+38} Q${cx-12},${i*50+42} ${cx-3},${i*50+30}`} fill={`oklch(${0.40+idx*0.03} 0.16 150)`} />}
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );

  const bg = (
    <>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,height:"22%", background:"linear-gradient(0deg,oklch(0.55 0.12 155/8%),transparent)" }} />
      <div style={{ position:"absolute",inset:0, background:"radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, oklch(0 0 0 / 60%) 100%)" }} />
    </>
  );
  const fg = (
    <>
      {dec.plants && <><BambooPatch side="left" /><BambooPatch side="right" /></>}
      {dec.window && (
        <div style={{ position:"absolute",top:"6%",right:"6%",opacity:0.75 }}>
          <div style={{ width:64,height:64,borderRadius:"50%", background:"radial-gradient(circle at 40% 40%, oklch(0.92 0.06 85), oklch(0.82 0.10 78) 50%, oklch(0.68 0.12 72))", boxShadow:"0 0 40px oklch(0.72 0.14 80/35%), 0 0 80px oklch(0.65 0.12 80/15%)" }} />
        </div>
      )}
      {dec.artwork && (
        <div style={{ position:"absolute",bottom:"12%",right:"4%",opacity:0.50 }}>
          <svg viewBox="0 0 80 50" style={{ width:80,height:50,display:"block" }}>
            <ellipse cx="20" cy="38" rx="18" ry="10" fill="oklch(0.28 0.08 155)" />
            <ellipse cx="44" cy="32" rx="14" ry="8" fill="oklch(0.32 0.09 150)" />
            <ellipse cx="63" cy="37" rx="10" ry="6" fill="oklch(0.25 0.07 152)" />
            <path d="M5,46 Q40,42 75,46" stroke="oklch(0.55 0.10 148)" strokeWidth="0.8" fill="none" opacity="0.5" />
            <path d="M5,48 Q40,44 75,48" stroke="oklch(0.55 0.10 148)" strokeWidth="0.8" fill="none" opacity="0.3" />
          </svg>
        </div>
      )}
    </>
  );
  return { bg, fg };
}

// ─── Lofi ──────────────────────────────────────────────────────────────────

function getLofiLayers(dec: Decorations) {
  const bg = (
    <>
      {/* City skyline */}
      <div style={{ position:"absolute",bottom:0,left:0,right:0,height:"30%" }}>
        <svg viewBox="0 0 1000 180" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="xMidYMax meet">
          {[[0,80,80,100],[85,50,60,130],[150,65,90,115],[245,30,50,150],[300,55,75,125],[380,40,100,140],[485,70,65,110],[555,35,55,145],[615,60,85,120],[705,45,70,135],[780,55,90,125],[875,40,80,140],[960,65,80,115],[940,20,60,160]].map(([x,h,w,y],i)=>(
            <g key={i}>
              <rect x={x} y={y} width={w} height={180-y} fill="oklch(0.12 0.06 278)" />
              {Array.from({length:Math.floor(h/18)},(_,r)=>Array.from({length:Math.floor(w/14)},(_,c)=>{
                const on=(i+r+c)%3!==0;
                return on?<rect key={`${r}-${c}`} x={x+4+c*14} y={y+4+r*18} width={8} height={10} rx="0.5" fill={`oklch(0.70 0.12 ${50+(r+c)*12}/${0.3+(r%2)*0.2})`} />:null;
              }))}
            </g>
          ))}
          <rect x="0" y="165" width="1000" height="15" fill="oklch(0.20 0.06 280)" opacity="0.6" />
        </svg>
      </div>
      <div style={{ position:"absolute",inset:0, background:"radial-gradient(ellipse 75% 75% at 50% 50%, transparent 35%, oklch(0 0 0 / 65%) 100%)" }} />
    </>
  );
  const fg = (
    <>
      {dec.candles && (
        <div style={{ position:"absolute",bottom:"28%",left:"4%",opacity:0.7 }}>
          <svg viewBox="0 0 60 90" style={{ width:60,height:90,display:"block" }}>
            <polygon points="10,38 50,38 42,18 18,18" fill="oklch(0.32 0.10 58)" />
            <rect x="28" y="38" width="4" height="38" fill="oklch(0.26 0.06 50)" />
            <ellipse cx="30" cy="78" rx="14" ry="4" fill="oklch(0.30 0.08 52)" />
            <polygon points="8,38 52,38 66,90 -6,90" fill="oklch(0.72 0.18 58/8%)" />
          </svg>
          <div style={{ position:"absolute",bottom:0,left:-20,right:-20,height:60, background:"radial-gradient(ellipse at 50% 0%, oklch(0.68 0.18 56/18%), transparent 70%)", animation:"lamp-pulse 3s ease-in-out infinite" }} />
        </div>
      )}
      {dec.artwork && (
        <div style={{ position:"absolute",top:"18%",right:"4%",opacity:0.50 }}>
          <svg viewBox="0 0 80 52" style={{ width:80,height:52,display:"block" }}>
            <rect x="2" y="2" width="76" height="48" rx="4" fill="oklch(0.20 0.10 280)" />
            <rect x="8" y="8" width="64" height="36" rx="2" fill="oklch(0.16 0.08 275)" />
            <circle cx="28" cy="28" r="10" fill="oklch(0.14 0.06 272)" />
            <circle cx="28" cy="28" r="4" fill="oklch(0.30 0.10 285)" />
            <circle cx="52" cy="28" r="10" fill="oklch(0.14 0.06 272)" />
            <circle cx="52" cy="28" r="4" fill="oklch(0.30 0.10 285)" />
            <path d="M38,20 Q40,36 42,20" stroke="oklch(0.55 0.14 50)" strokeWidth="1.5" fill="none" />
            <text x="40" y="14" fontSize="5" fill="oklch(0.75 0.18 285)" textAnchor="middle" fontFamily="monospace">LOFI MIX</text>
          </svg>
        </div>
      )}
    </>
  );
  return { bg, fg };
}

// ─── Reading Nook ──────────────────────────────────────────────────────────

function getNookLayers(dec: Decorations, rainVol: number, fireVol: number) {
  const bg = (
    <>
      <div style={{ position:"absolute",bottom:0,left:"15%",right:"15%",height:"6%",opacity:0.22,borderRadius:"4px 4px 0 0",
        background:`repeating-linear-gradient(90deg,oklch(0.68 0.18 38/70%) 0px,oklch(0.68 0.18 38/70%) 4px,oklch(0.56 0.16 50/50%) 4px,oklch(0.56 0.16 50/50%) 14px,oklch(0.68 0.18 38/70%) 14px,oklch(0.68 0.18 38/70%) 18px)` }} />
      <div style={{ position:"absolute",inset:0, background:"radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, oklch(0 0 0 / 60%) 100%)" }} />
    </>
  );
  const fg = (
    <>
      {dec.candles && (
        <>
          <div style={{ position:"absolute",top:0,left:"3%",width:"28%",height:"45%",
            background:"radial-gradient(ellipse 80% 100% at 20% 0%, oklch(0.68 0.20 56/18%), transparent 70%)", animation:"lamp-pulse 4s ease-in-out infinite" }} />
          <div style={{ position:"absolute",top:"4%",left:"4%",opacity:0.6 }}>
            <svg viewBox="0 0 50 80" style={{ width:50,height:80,display:"block" }}>
              <polygon points="4,44 46,44 40,12 10,12" fill="oklch(0.40 0.12 52)" />
              <rect x="8" y="14" width="34" height="4" fill="oklch(0.55 0.15 56)" opacity="0.7" />
              <rect x="23" y="44" width="4" height="30" fill="oklch(0.30 0.08 48)" />
              <ellipse cx="25" cy="74" rx="12" ry="3" fill="oklch(0.28 0.08 46)" />
            </svg>
          </div>
        </>
      )}
      {dec.plants && (
        <div style={{ position:"absolute",top:"12%",left:"1%",bottom:"8%",width:"4%",opacity:0.52 }}>
          <svg viewBox="0 0 30 500" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="none">
            {[0,0.25,0.5,0.75].map((pct,si)=>(
              <g key={si}>
                <rect x="0" y={pct*500} width="30" height="7" fill="oklch(0.30 0.08 50)" />
                {[{w:5,h:55,c:"oklch(0.44 0.14 30)"},{w:7,h:65,c:"oklch(0.38 0.12 45)"},{w:4,h:48,c:"oklch(0.52 0.16 155)"},{w:6,h:60,c:"oklch(0.42 0.14 260)"},{w:5,h:52,c:"oklch(0.48 0.14 38)"}].reduce((acc:React.ReactNode[],b,bi)=>{
                  const px=[0,5,12,16,22][bi];
                  acc.push(<rect key={bi} x={px} y={pct*500+7-b.h} width={b.w} height={b.h} fill={b.c} rx="0.5" />);
                  return acc;
                },[])}
              </g>
            ))}
          </svg>
        </div>
      )}
      {dec.artwork && (
        <div style={{ position:"absolute",bottom:"8%",right:"3%",opacity:0.38 }}>
          <svg viewBox="0 0 100 80" style={{ width:100,height:80,display:"block" }}>
            <rect x="10" y="10" width="80" height="50" rx="8" fill="oklch(0.28 0.10 48)" />
            <rect x="5" y="42" width="90" height="25" rx="6" fill="oklch(0.32 0.12 50)" />
            <rect x="2" y="30" width="12" height="38" rx="5" fill="oklch(0.26 0.09 46)" />
            <rect x="86" y="30" width="12" height="38" rx="5" fill="oklch(0.26 0.09 46)" />
            <rect x="14" y="65" width="6" height="15" rx="2" fill="oklch(0.22 0.07 44)" />
            <rect x="80" y="65" width="6" height="15" rx="2" fill="oklch(0.22 0.07 44)" />
            <path d="M18,42 Q50,50 82,42" stroke="oklch(0.40 0.12 52)" strokeWidth="1.5" fill="none" opacity="0.5" />
          </svg>
        </div>
      )}
      {dec.candles && (
        <div style={{ position:"absolute",bottom:"15%",right:"4%",opacity:0.55 }}>
          <svg viewBox="0 0 36 32" style={{ width:36,height:32,display:"block" }}>
            <path d="M12,8 Q14,2 12,0" stroke="oklch(0.75 0.04 75)" strokeWidth="1" fill="none" opacity="0.5" style={{animation:"steam-rise 2s ease-in-out infinite"}} />
            <path d="M18,10 Q20,3 18,0" stroke="oklch(0.75 0.04 75)" strokeWidth="1" fill="none" opacity="0.4" style={{animation:"steam-rise 2.4s ease-in-out 0.4s infinite"}} />
            <path d="M4,12 L6,28 L28,28 L30,12 Z" fill="oklch(0.38 0.10 52)" />
            <path d="M4,12 Q17,16 30,12" fill="oklch(0.50 0.14 56)" />
            <path d="M30,16 Q40,16 40,22 Q40,28 30,28" stroke="oklch(0.38 0.10 52)" strokeWidth="2.5" fill="none" />
            <ellipse cx="17" cy="30" rx="16" ry="3" fill="oklch(0.32 0.08 48)" />
          </svg>
        </div>
      )}
      {dec.window && (
        <div style={{ position:"absolute",top:"6%",right:"3%" }}>
          <WindowFrame rainVol={rainVol} fireVol={fireVol} theme="nook" />
          <div style={{ position:"absolute",inset:-2, background:"linear-gradient(90deg,oklch(0.42 0.10 50/80%) 0%,transparent 30%),linear-gradient(270deg,oklch(0.42 0.10 50/80%) 0%,transparent 30%)" }} />
        </div>
      )}
    </>
  );
  return { bg, fg };
}

// ─── Mountain ──────────────────────────────────────────────────────────────

function getMountainLayers(dec: Decorations, rainVol: number) {
  const bg = (
    <>
      <div style={{ position:"absolute",bottom:0,left:0,right:0,height:"45%" }}>
        <svg viewBox="0 0 1000 280" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="none">
          <polygon points="0,280 80,110 180,180 280,70 400,160 520,60 640,140 760,80 880,160 1000,90 1000,280" fill="oklch(0.15 0.04 220)" opacity="0.9" />
          <polygon points="280,70 310,120 250,120" fill="oklch(0.85 0.03 210)" opacity="0.7" />
          <polygon points="520,60 555,115 485,115" fill="oklch(0.85 0.03 210)" opacity="0.7" />
          <polygon points="760,80 800,130 720,130" fill="oklch(0.85 0.03 210)" opacity="0.7" />
          <polygon points="0,280 120,150 240,220 380,100 500,200 620,90 740,170 860,110 1000,180 1000,280" fill="oklch(0.11 0.032 218)" />
          <polygon points="380,100 415,155 345,155" fill="oklch(0.88 0.03 200)" opacity="0.85" />
          <polygon points="620,90 660,148 580,148" fill="oklch(0.88 0.03 200)" opacity="0.85" />
        </svg>
      </div>
      <div style={{ position:"absolute",inset:0, background:"radial-gradient(ellipse 78% 78% at 50% 50%, transparent 38%, oklch(0 0 0 / 62%) 100%)" }} />
    </>
  );
  const fg = (
    <>
      {dec.plants && (
        <>
          <div style={{ position:"absolute",bottom:"15%",left:0,width:"8%",height:"50%" }}>
            <svg viewBox="0 0 60 300" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="xMidYMax meet">
              {[[6,240,0.85],[22,210,1.0],[38,260,0.75],[50,230,0.90]].map(([cx,base,op],idx)=>(
                <g key={idx} opacity={op}>
                  <polygon points={`${cx},${base-110} ${cx-18},${base} ${cx+18},${base}`} fill="oklch(0.18 0.06 185)" />
                  <polygon points={`${cx},${base-150} ${cx-14},${base-55} ${cx+14},${base-55}`} fill="oklch(0.20 0.06 188)" />
                  <polygon points={`${cx},${base-180} ${cx-10},${base-105} ${cx+10},${base-105}`} fill="oklch(0.22 0.07 190)" />
                  <line x1={cx-14} y1={base-55} x2={cx+14} y2={base-55} stroke="oklch(0.88 0.02 200)" strokeWidth="2" opacity="0.7" />
                  <line x1={cx-10} y1={base-105} x2={cx+10} y2={base-105} stroke="oklch(0.88 0.02 200)" strokeWidth="1.5" opacity="0.6" />
                  <rect x={cx-2} y={base} width={4} height={20} fill="oklch(0.22 0.04 42)" />
                </g>
              ))}
            </svg>
          </div>
          <div style={{ position:"absolute",bottom:"15%",right:0,width:"8%",height:"50%" }}>
            <svg viewBox="0 0 60 300" style={{ width:"100%",height:"100%",display:"block" }} preserveAspectRatio="xMidYMax meet">
              {[[10,250,0.90],[26,215,1.0],[42,235,0.80],[54,260,0.85]].map(([cx,base,op],idx)=>(
                <g key={idx} opacity={op}>
                  <polygon points={`${cx},${base-115} ${cx-18},${base} ${cx+18},${base}`} fill="oklch(0.18 0.06 185)" />
                  <polygon points={`${cx},${base-155} ${cx-13},${base-58} ${cx+13},${base-58}`} fill="oklch(0.20 0.06 188)" />
                  <polygon points={`${cx},${base-185} ${cx-9},${base-108} ${cx+9},${base-108}`} fill="oklch(0.22 0.07 190)" />
                  <line x1={cx-13} y1={base-58} x2={cx+13} y2={base-58} stroke="oklch(0.88 0.02 200)" strokeWidth="2" opacity="0.7" />
                  <line x1={cx-9} y1={base-108} x2={cx+9} y2={base-108} stroke="oklch(0.88 0.02 200)" strokeWidth="1.5" opacity="0.6" />
                  <rect x={cx-2} y={base} width={4} height={20} fill="oklch(0.22 0.04 42)" />
                </g>
              ))}
            </svg>
          </div>
        </>
      )}
      {dec.artwork && Array.from({length:16},(_,i)=>{
        const sz = i%3===0?10:7;
        return (
          <div key={i} style={{ position:"absolute", left:`${5+(i*6.2)%92}%`, top:-10, opacity:0.28+(i%4)*0.1, animation:`snowfall ${5+(i*1.3)%6}s linear ${(i*0.7)%6}s infinite`, filter:"blur(0.3px)", pointerEvents:"none" }}>
            <div style={{ width:sz, height:sz, position:"relative" }}>
              <div style={{ position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:"100%",height:1.5,background:"oklch(0.88 0.02 200)",borderRadius:1 }} />
              <div style={{ position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:1.5,height:"100%",background:"oklch(0.88 0.02 200)",borderRadius:1 }} />
              <div style={{ position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%) rotate(45deg)",width:"100%",height:1.5,background:"oklch(0.88 0.02 200)",borderRadius:1,opacity:0.6 }} />
              <div style={{ position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%) rotate(-45deg)",width:"100%",height:1.5,background:"oklch(0.88 0.02 200)",borderRadius:1,opacity:0.6 }} />
            </div>
          </div>
        );
      })}
      {dec.window && (
        <>
          <div style={{ position:"absolute",top:0,left:0,right:0,height:"12%", background:"linear-gradient(180deg,oklch(0.75 0.06 200/6%),transparent)" }} />
          <div style={{ position:"absolute",top:0,left:0,right:0,height:"4%",
            background:`repeating-linear-gradient(90deg,oklch(0.80 0.06 200/8%) 0px,oklch(0.80 0.06 200/4%) 20px,transparent 20px,transparent 60px)` }} />
        </>
      )}
    </>
  );
  return { bg, fg };
}

// ─── Root export ────────────────────────────────────────────────────────────

export function RoomBackdrop() {
  const { theme, decorations } = useRoomStore();
  const { rainVol, fireVol } = useAmbientStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const layers = (() => {
    if (theme === "cabin")    return getCabinLayers(decorations, rainVol, fireVol);
    if (theme === "bamboo")   return getBambooLayers(decorations, rainVol);
    if (theme === "lofi")     return getLofiLayers(decorations);
    if (theme === "nook")     return getNookLayers(decorations, rainVol, fireVol);
    if (theme === "mountain") return getMountainLayers(decorations, rainVol);
    return getCabinLayers(decorations, rainVol, fireVol);
  })();

  return (
    <>
      {/* ── BG layer: behind content (z=2) ── */}
      <div style={{ position:"fixed", inset:0, zIndex:2, pointerEvents:"none", overflow:"hidden" }}>
        {layers.bg}
      </div>

      {/* ── FG layer: decorations float IN FRONT of content (z=28) ── */}
      {/* opacity:0.45 so artwork never obscures the dashboard content */}
      <div style={{ position:"fixed", inset:0, zIndex:28, pointerEvents:"none", overflow:"hidden", opacity:0.45 }}>
        {layers.fg}
      </div>

      <style>{`
        @keyframes candle-flicker {
          0%,100% { transform:scaleX(1) scaleY(1) translateX(0); opacity:1; }
          25%     { transform:scaleX(0.88) scaleY(1.14) translateX(1px); opacity:0.85; }
          50%     { transform:scaleX(1.10) scaleY(0.90) translateX(-1px); opacity:0.90; }
          75%     { transform:scaleX(0.95) scaleY(1.06) translateX(0.5px); opacity:0.95; }
        }
        @keyframes candle-glow {
          0%,100% { opacity:0.6; transform:scale(1); }
          40%     { opacity:0.4; transform:scale(0.9); }
          70%     { opacity:0.7; transform:scale(1.1); }
        }
        @keyframes lamp-pulse {
          0%,100% { opacity:1; }
          50%     { opacity:0.82; }
        }
        @keyframes star-twinkle {
          0%,100% { opacity:0.85; transform:scale(1); }
          50%     { opacity:0.30; transform:scale(0.6); }
        }
        @keyframes window-rain {
          0%   { transform:translateY(-5px); opacity:0; }
          10%  { opacity:1; }
          100% { transform:translateY(140px); opacity:0; }
        }
        @keyframes steam-rise {
          0%   { transform:translateY(0) scale(1); opacity:0.5; }
          100% { transform:translateY(-12px) scale(1.4); opacity:0; }
        }
        @keyframes snowfall {
          0%   { transform:translateY(-20px) translateX(0) rotate(0deg); opacity:0; }
          10%  { opacity:1; }
          90%  { opacity:0.6; }
          100% { transform:translateY(100vh) translateX(20px) rotate(360deg); opacity:0; }
        }
      `}</style>
    </>
  );
}
