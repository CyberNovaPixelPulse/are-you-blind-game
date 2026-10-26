import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteUrl) return [];
  return ["/", "/play", "/challenge", "/pk", "/create", "/guidelines", "/terms"]
    .map((path) => ({ url: new URL(path, siteUrl).toString() }));
}
