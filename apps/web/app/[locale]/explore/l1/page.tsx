import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale, locales } from "../../../_lib/i18n/routing";
import { translator } from "../../../_lib/i18n";
import { portalUrlFor } from "../../../_lib/portal-routing";
import { publishedProductCatalog } from "../../../_components/catalog/published-product-catalog";
import { L8ProductPage } from "../../../_components/product/l8-product";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translator(locale);
  return {
    title: t("l8.title"), description: t("l8.description"),
    alternates: {
      canonical: `https://www.alsvidbike.com/${locale}/explore/l1`,
      languages: Object.fromEntries([...locales.map(item => [item, `https://www.alsvidbike.com/${item}/explore/l1`]), ["x-default", "https://www.alsvidbike.com/en/explore/l1"]]),
    },
    openGraph: { title: t("l8.title"), description: t("l8.description"), images: [{url:"/products/l8/retouched-side.webp",width:1254,height:1254,alt:t("l8.gallery.side.alt")}] },
  };
}
export default async function L1Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const host = (await headers()).get("host") ?? "";
  const prefix = host.toLowerCase().split(".")[0];
  if (prefix === "admin" || prefix === "my" || prefix === "dealer") redirect(`/${prefix}`);
  const product = (await publishedProductCatalog()).items.find(item => item.code === "L1");
  if (product) redirect(`/${locale}/explore/${product.productId}`);
  return <L8ProductPage locale={locale} myUrl={portalUrlFor(host,"my")} />;
}
