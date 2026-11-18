import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config";

// Indexable pages only; noindex views are deliberately left out.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/phases`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
