import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config";

// Only /api/ is disallowed. Private pages (/projects, /projects/new) use a noindex meta tag instead:
// blocking them here would stop crawlers from ever seeing that tag, so the two rules must not overlap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
