import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * robots.txt — public catalog is crawlable; private/auth/API surfaces are not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/login",
          "/register",
          "/verify-email",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
