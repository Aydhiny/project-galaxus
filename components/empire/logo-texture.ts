import * as THREE from "three";

/** A round logo badge drawn from the brand's official SVG path (simple-icons, CC0). `mono` = graphite badge, white mark. */
export function logoTexture(path: string, hex: string, mono = false) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = mono ? "#3f3f46" : "#ffffff";
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = mono ? "#18181b" : hex.toUpperCase() === "FFFFFF" ? "#222c37" : `#${hex}`; // white marks (Unity) get a dark badge
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.translate(64 - 36, 64 - 36);
  g.scale(3, 3); // simple-icons paths live in a 24×24 box → 72 px
  g.fillStyle = "#ffffff";
  g.fill(new Path2D(path));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
