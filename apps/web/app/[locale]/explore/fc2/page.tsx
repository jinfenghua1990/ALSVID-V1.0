import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale, locales } from "../../../_lib/i18n/routing";
import { translator } from "../../../_lib/i18n";
import { portalUrlFor } from "../../../_lib/portal-routing";
import { Fc2ProductPage } from "../../../_components/product/fc2-product";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translator(locale);
  return {
    title: t("fc2.title"), description: t("fc2.description"),
    alternates: {
      canonical: `https://www.alsvidbike.com/${locale}/explore/fc2`,
      languages: Object.fromEntries([...locales.map(item => [item, `https://www.alsvidbike.com/${item}/explore/fc2`]), ["x-default", "https://www.alsvidbike.com/en/explore/fc2"]]),
    },
    openGraph: { title: t("fc2.title"), description: t("fc2.description"), images: [{url:"/products/fc2/side-studio-1536.webp",width:1536,height:1024,alt:t("fc2.gallery.alt.side")}] },
  };
}
export default async function Fc2Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const host = (await headers()).get("host") ?? "";
  const prefix = host.toLowerCase().split(".")[0];
  if (prefix === "admin" || prefix === "my" || prefix === "dealer") redirect(`/${prefix}`);
  return <Fc2ProductPage locale={locale} dealerUrl={portalUrlFor(host,"dealer")} myUrl={portalUrlFor(host,"my")} />;
}
