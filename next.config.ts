import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  // Scripts: self + Next.js inline chunks
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Styles: self + inline (Tailwind, Next.js)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' https://fonts.gstatic.com",
  // Images: allow any HTTPS source (personal app — YouTube, GitHub chart, future embeds)
  "img-src 'self' data: blob: https:",
  // Frames: YouTube no-cookie only
  "frame-src https://www.youtube-nocookie.com",
  // Connections: self, prayer times API, Aladhan, NeonDB goes through server actions so just self
  "connect-src 'self' https://api.aladhan.com https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  // Workers for Next.js
  "worker-src 'self' blob:",
  // Media
  "media-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "ghchart.rshah.org" },
    ],
  },
};

export default nextConfig;
