import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import { translator } from "../../../_lib/i18n";
import { isLocale } from "../../../_lib/i18n/routing";
import { getHomeDetail } from "../../../_lib/home-details";
import { portalUrlFor } from "../../../_lib/portal-routing";
import { PublicSiteHeader } from "../../../_components/public-site-header";
import { PendingPurchaseActions } from "../../../_components/product/pending-purchase-actions";
import type { AccessoryCategory } from "../../../_lib/commerce/storefront-cart";
import { Fc1ProductPage, generateFc1Metadata } from "../../../_components/product/fc1-product";
import { Fc1StoryPage } from "../../../_components/product/fc1-story-v4";
import { Fc2ProductPage } from "../../../_components/product/fc2-product";
import { L7ProductPage } from "../../../_components/product/l7-product";
import { L8ProductPage } from "../../../_components/product/l8-product";
import { publishedProductCatalog } from "../../../_components/catalog/published-product-catalog";
import styles from "../../../_components/home/original-home.module.css";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ view?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (slug === "100001" && isLocale(locale)) return {alternates:{canonical:`https://www.alsvidbike.com/${locale}/explore/l1`}};
  if (/^\d{6}$/.test(slug)) {
    const product = (await publishedProductCatalog()).items.find(item => item.productId === slug);
    if (product && isLocale(locale)) return {title:product.title[locale],alternates:{canonical:`https://www.alsvidbike.com/${locale}/explore/${slug}`}};
  }
  if (slug === "fc1") return generateFc1Metadata(locale);
  const detail = getHomeDetail(slug);
  if (!isLocale(locale) || !detail) return {};
  const t = translator(locale);
  return {
    title: `${t(detail.title)} | ${t("brand.name")}`,
    description: t(detail.body),
    alternates: {
      canonical: `https://www.alsvidbike.com/${locale}/explore/${slug}`,
      languages: { zh: `https://www.alsvidbike.com/zh/explore/${slug}`,
        de: `https://www.alsvidbike.com/de/explore/${slug}`,
        en: `https://www.alsvidbike.com/en/explore/${slug}`,
      },
    },
  };
}
export default async function HomeDetailPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (slug === "100001") {
    if (!isLocale(locale)) notFound();
    permanentRedirect(`/${locale}/explore/l1`);
  }
  if (/^\d{6}$/.test(slug)) {
    if (!isLocale(locale)) notFound();
    const product = (await publishedProductCatalog()).items.find(item => item.productId === slug && item.type === "BIKE");
    if (!product) notFound();
    // Numeric product IDs stay as safe redirect aliases, never canonical SEO landing pages.
    const routes: Record<string,string> = {'A1-ULTRA':'fc1','L1-PRO':'fc2',A1:'l7',L1:'l1'};
    const target = routes[product.code];
    if (!target) notFound();
    permanentRedirect(`/${locale}/explore/${target}`);
  }
  if (slug === "fc1") {
    if (!isLocale(locale)) notFound();
    const host = (await headers()).get("host") ?? "";
    const prefix = host.toLowerCase().split(".")[0];
    if (prefix === "admin" || prefix === "my" || prefix === "dealer") redirect(`/${prefix}`);
    const classic = (await searchParams).view === "classic";
    const ProductPage = classic ? Fc1ProductPage : Fc1StoryPage;
    return <ProductPage locale={locale} myUrl={portalUrlFor(host, "my")} />;
  }
  const detail = getHomeDetail(slug);
  if (!isLocale(locale) || !detail) notFound();
  const host = (await headers()).get("host") ?? "";
  const prefix = host.toLowerCase().split(".")[0];
  if (prefix === "admin" || prefix === "my" || prefix === "dealer")
    redirect(`/${prefix}`);
  const t = translator(locale);
  const home = `/${locale}`;
  const accessoryCategories: AccessoryCategory[] = ["basket","rack","mudguard","light","parts"];
  const accessory = accessoryCategories.find(id => slug === "accessory-" + id);
  return (
    <main
      translate="no"
      className={styles.page}
      lang={locale}
      data-home-detail={slug}
    >
      <PublicSiteHeader locale={locale} myUrl={portalUrlFor(host, "my")} active={slug === "about-story" ? "story" : undefined} />
      <article className={styles.detailArticle}>
        <div className={styles.detailIntro}>
          <div>
            <p className={styles.eyebrow}>{t("detail.concept_title")}</p>
            <h1>{t(detail.title)}</h1>
            <p>{t(detail.body)}</p>
            <a className={styles["btn-dark"]} href={`${home}#platforms`}>
              {t("detail.explore_platforms")}
            </a>
          </div>
          <img
            src={`/home/original/${detail.image}.webp`}
            alt={t(detail.alt)}
            width={1536}
            height={1024}
          />
        </div>
        <section className={styles.detailBody}>
          <h2>{t("detail.concept_title")}</h2>
          <p>{t(`detail.${detail.category}_body`)}</p>
          {detail.category === "model" ? (
            <>
              <h2>{t("technology.eyebrow")}</h2>
              <p>{t("technology.description")}</p>
              <a href={`${home}#tech`}>{t("common.learn_more")}</a>
            </>
          ) : null}
          {detail.category === "accessory" && accessory ? <PendingPurchaseActions locale={locale} selection={{product:"ACCESSORY",category:accessory}}/> : null}
          <h2>{t("detail.next_title")}</h2>
          <p>{t("commerce.body")}</p>
          <a className={styles["btn-dark"]} href={portalUrlFor(host, "my")}>
            {t("detail.owner_support")}
          </a>
          <a className={styles.detailBack} href={home}>
            {t("common.back_home")}
          </a>
        </section>
      </article>
      <footer className={styles.notice}>{t("notice")}</footer>
    </main>
  );
}
