import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms", "/login", "/register"],
        disallow: [
          "/api/",
          "/dashboard",
          "/daily",
          "/goals",
          "/journal",
          "/reading",
          "/book-reader/",
          "/study",
          "/training",
          "/workout",
          "/meditation",
          "/creative",
          "/duas",
          "/beats",
          "/yearly",
          "/insights",
          "/metrics",
          "/review",
          "/leaderboard",
          "/notes",
          "/heatmap",
          "/spiritual",
          "/overview",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
