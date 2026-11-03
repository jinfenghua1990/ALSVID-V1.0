import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale, locales } from "../../../_lib/i18n/routing";
import { translator } from "../../../_lib/i18n";
import { portalUrlFor } from "../../../_lib/portal-routing";
import { L7ProductPage } from "../../../_components/product/l7-product";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translator(locale);
  return {
    title: t("l7.title"), description: t("l7.description"),
    alternates: {
      canonical: `https://www.alsvidbike.com/${locale}/explore/l7`,
      languages: Object.fromEntries([...locales.map(item => [item, `https://www.alsvidbike.com/${item}/explore/l7`]), ["x-default", "https://www.alsvidbike.com/en/explore/l7"]]),
    },
    openGraph: { title: t("l7.title"), description: t("l7.description"), images: [{url:"/products/l7/reference-side.jpg",width:1024,height:1024,alt:t("l7.gallery.side.alt")}] },
  };
}
export default async function L7Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const host = (await headers()).get("host") ?? "";
  const prefix = host.toLowerCase().split(".")[0];
  if (prefix === "admin" || prefix === "my" || prefix === "dealer") redirect(`/${prefix}`);
  return <L7ProductPage locale={locale} myUrl={portalUrlFor(host,"my")} />;
}
