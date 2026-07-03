export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const SITE_NAME = "Galaxus";
export const SITE_DESCRIPTION =
  "Habits, prayers, goals, deep work, and creative projects — tracked, streaked, and visualized in one calm, beautiful space. Built by Plansio.";
