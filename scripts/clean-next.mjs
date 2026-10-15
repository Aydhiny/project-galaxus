// Start every build from a clean .next. Vercel restores the previous build's cache,
// and a stale Turbopack cache can fail a deploy ("next/font/google queries have
// exactly one entry") even when the code builds fine from scratch.
import { rmSync } from "node:fs";
rmSync(".next", { recursive: true, force: true });
console.log("[clean-next] removed .next");
