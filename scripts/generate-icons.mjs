// Generates the PWA / iOS icon set and iPhone launch screens from one SVG mark.
// Run: node scripts/generate-icons.mjs   (outputs into public/icons + public/splash)
import sharp from "sharp";
import { mkdirSync } from "fs";

const BG = "#1e1f22"; // matches the app's dark background → no flash on launch
const FG = "#ededeb";
const ACCENT = "#6b8afd";

// Four-point star ("✦") centred in a 512 box; `scale` shrinks it for safe zones.
function markSvg(size, { scale = 1, rounded = false, bg = BG } = {}) {
  const r = 160 * scale;
  const c = 256;
  const k = 0.18; // pinch — how slim the star's waist is
  const path = `M${c} ${c - r} C ${c + r * k} ${c - r * k}, ${c + r * k} ${c - r * k}, ${c + r} ${c}
    C ${c + r * k} ${c + r * k}, ${c + r * k} ${c + r * k}, ${c} ${c + r}
    C ${c - r * k} ${c + r * k}, ${c - r * k} ${c + r * k}, ${c - r} ${c}
    C ${c - r * k} ${c - r * k}, ${c - r * k} ${c - r * k}, ${c} ${c - r} Z`;
  const dot = 22 * scale;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${bg}"/>
    <path d="${path}" fill="${FG}"/>
    <circle cx="${c + r * 0.72}" cy="${c - r * 0.72}" r="${dot}" fill="${ACCENT}"/>
  </svg>`);
}

async function png(svg, out) {
  await sharp(svg).png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out);
}

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/splash", { recursive: true });

// Standard icons ("any"): rounded corners baked in for browsers that don't mask.
await png(markSvg(192, { rounded: true }), "public/icons/icon-192.png");
await png(markSvg(512, { rounded: true }), "public/icons/icon-512.png");
// Maskable: full-bleed background, mark inside the 80% safe zone (Android crops to any shape).
await png(markSvg(512, { scale: 0.78 }), "public/icons/maskable-512.png");
// Apple touch icon: MUST be opaque and square — iOS applies its own rounded mask.
await png(markSvg(180, { scale: 0.9 }), "public/icons/apple-touch-icon.png");
await png(markSvg(32, { rounded: true }), "public/icons/favicon-32.png");

// iPhone launch screens (portrait). iOS shows a blank white screen while a
// home-screen app boots unless a size-exact startup image matches the device.
export const SPLASHES = [
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 }, // 16 Pro Max
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 }, // 16 Pro
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 }, // 15 Pro Max / 15 Plus / 14 Pro Max / 16 Plus
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 }, // 15 / 15 Pro / 14 Pro / 16
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 }, // 14 Plus / 13 Pro Max / 12 Pro Max
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 }, // 14 / 13 / 13 Pro / 12 / 12 Pro
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 }, // X / XS / 11 Pro / 12-13 mini
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 }, // XS Max / 11 Pro Max
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 }, // XR / 11
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 }, // SE / 8
];

for (const s of SPLASHES) {
  const markSize = Math.round(s.w * 0.28);
  const mark = await sharp(markSvg(markSize, { scale: 0.9, bg: "transparent" })).png().toBuffer();
  await sharp({ create: { width: s.w, height: s.h, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(`public/splash/splash-${s.w}x${s.h}.png`);
  console.log("wrote", `public/splash/splash-${s.w}x${s.h}.png`);
}
