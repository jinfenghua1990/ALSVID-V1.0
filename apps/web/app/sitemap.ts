import type { MetadataRoute } from "next";
import { homeDetails } from "./_lib/home-details";
import { locales } from "./_lib/i18n/routing";

const siteUrl = "https://www.alsvidbike.com";

const publicPagePaths = [
  "/bikes",
  "/dealers",
  "/dealers/locations",
  "/service-locations",
] as const;

// These product pages have dedicated route files rather than homeDetails entries.
const dedicatedProductPaths = [
  "/explore/fc2",
  "/explore/l7",
  "/explore/l1",
  "/explore/accessory-cup-holder",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const detailPaths = Object.keys(homeDetails).map((slug) => `/explore/${slug}`);
  const paths = Array.from(new Set([
    ...publicPagePaths,
    ...detailPaths,
    ...dedicatedProductPaths,
  ]));

  return locales.flatMap((locale) => {
    const homePath = `/${locale}/`;
    const localizedPaths = [homePath, ...paths.map((path) => `/${locale}${path}`)];

    return localizedPaths.map((path) => ({
      url: `${siteUrl}${path}`,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((lang) => [
            lang,
            `${siteUrl}/${lang}${path === homePath ? '/' : path.slice(locale.length + 1)}`,
          ])),
          'x-default': `${siteUrl}/en${path === homePath ? '/' : path.slice(locale.length + 1)}`,
        },
      },
      changeFrequency: path === homePath ? "weekly" as const : "monthly" as const,
      priority: path === homePath ? 1 : path.includes("/explore/") ? 0.8 : 0.7,
    }));
  });
}
