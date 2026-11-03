import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogShell } from "../../_components/catalog/catalog-shell";
import { BikesModelNavigator } from "../../_components/catalog/bikes-model-navigator";
import { BikesModelSideNavigator } from "../../_components/catalog/bikes-model-side-navigator";
import { BikesDiscovery } from "../../_components/catalog/bikes-discovery";
import { AccessoriesCatalogSection } from "../../_components/catalog/accessories-catalog-section";
import { publishedBikeCatalog, publishedProductCatalog } from "../../_components/catalog/published-product-catalog";
import { translator, type TranslationKey } from "../../_lib/i18n";
import { isLocale, locales } from "../../_lib/i18n/routing";
import styles from "./page.module.css";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ platform?: string; category?: string; sort?: string }> };
const platformIds = ["fc", "ct", "ft", "gt"] as const;
type PlatformId = typeof platformIds[number];
const platformAssets: Record<PlatformId, string> = {
  fc: "/home/original/fc1-product.webp",
  ct: "/home/original/scene-city.webp",
  ft: "/home/original/scene-fat-tire.webp",
  gt: "/home/original/scene-touring.webp",
};

export function generateStaticParams() { return locales.map(locale => ({ locale })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translator(locale);
  return {
    title: t("catalog.nav.bikes") + " | ALSVID",
    description: t("catalog.bikes.hero.body"),
    alternates: {
      canonical: `https://www.alsvidbike.com/${locale}/bikes`,
      languages: Object.fromEntries(locales.map(lang => [lang, `https://www.alsvidbike.com/${lang}/bikes`])),
    },
  };
}

export default async function BikesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = translator(locale);
  const query = await searchParams;
  const requested = query.platform?.toLowerCase();
  const active: PlatformId | null = platformIds.find(id => id === requested) ?? null;
  const sortMode = query.sort === "name" ? "name" : "featured";
  const prefix = "/" + locale;
  const publicCatalog = await publishedBikeCatalog();
  const publishedProducts = (await publishedProductCatalog()).items.filter(item => item.type === "ACCESSORY" || item.type === "SERVICE_PART");
  // Brand previews remain visibly distinct from an approved public catalogue item.
  // A previously published-and-withdrawn model is excluded when catalogue facts are available.
  const previews = [
    { id:"fc1",code:"A1-ULTRA",platform:"fc",name:t("product.model_fc1"),status:t("catalog.bikes.models.fc1"),
      image:"/home/original/fc1-product.webp",alt:t("images.product"),href:prefix+"/explore/fc1" },
    { id:"fc2",code:"L1-PRO",platform:"fc",name:t("fc2.model"),status:t("catalog.bikes.models.fc2"),
      image:"/products/fc2/side-studio-1536.webp",alt:t("fc2.gallery.alt.side"),href:prefix+"/explore/fc2" },
    { id:"l7",code:"A1",platform:"fc",name:t("l7.model"),status:t("catalog.bikes.models.preview"),
      image:"/products/l7/reference-side.jpg",alt:t("l7.gallery.side.alt"),href:prefix+"/explore/l7" },
    { id:"l8",code:"L1",platform:"fc",name:t("l8.model"),status:t("catalog.bikes.models.preview"),
      image:"/products/l8/retouched-side.webp",alt:t("l8.gallery.side.alt"),href:prefix+"/explore/l1" },
  ] as const;
  const models = previews.filter(model=>{
      if (!publicCatalog.available) return true;
      return !publicCatalog.suppressedCodes.includes(model.code);
    }).map(model=>{
      const reviewed=publicCatalog.items.find(item=>item.code===model.code);
      return {id:model.id,code:model.code,platform:model.platform,name:reviewed?.title[locale]??model.name,
        status:reviewed?t("catalog.bikes.models.published"):model.status,
        image:reviewed?.image??model.image,alt:reviewed?.title[locale]??model.alt,
        href:model.href,modelId:reviewed?.modelId,productId:reviewed?.productId,reviewed:Boolean(reviewed)};
    });
  const modelSideLinks = models.map(model => ({ id: "model-" + model.id, label: model.name, href: prefix + "/bikes?platform=" + model.platform + "#model-" + model.id }));
  const filteredModels = models.filter(model => !active || model.platform === active);
  const navLinks = [
    { id: "models", label: t("catalog.product.tabs.bikes"), href: prefix + "/bikes#models" },
    { id: "platforms", label: t("catalog.product.tabs.platforms"), href: prefix + "/bikes#platforms" },
    { id: "accessories", label: t("catalog.product.tabs.accessories"), href: prefix + "/bikes#accessories" },
  ];
  return <CatalogShell locale={locale} active="bikes">
    <main className={styles.page} lang={locale} data-bikes-catalog="1">
      <BikesModelNavigator title={t("catalog.product.tabs.label")} links={navLinks} />
      <section className={styles.hero} data-bikes-hero>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>{t("catalog.bikes.hero.kicker")}</span>
          <h1>{t("catalog.bikes.hero.title")}</h1>
          <p>{t("catalog.bikes.hero.body")}</p>
          <a className={styles.heroButton} href="#models">{t("catalog.bikes.hero.cta")}</a>
        </div>
        <img className={styles.heroImage} src={models.find(item=>item.id==='fc1')?.image??'/home/original/scene-city.webp'} alt={models.find(item=>item.id==='fc1')?.alt??t("images.city")} width={1536} height={1024} />
        <span className={styles.heroWatermark} aria-hidden="true">ALSVID</span>
      </section>




      <nav className={styles.quickModels} aria-label={t("catalog.bikes.quickModels.title")} data-bikes-quick-models>
        <div className={styles.quickModelsHeading}>
          <span>{t("catalog.bikes.quickModels.title")}</span>
          <small>{t("catalog.bikes.quickModels.note")}</small>
        </div>
        <div className={styles.quickModelsList}>
          {models.map(model => <a key={model.id}
            href={prefix + "/bikes?platform=" + model.platform + "#model-" + model.id}
            className={styles.quickModel} data-quick-model={model.id}>
            <img src={model.image} alt="" loading="lazy" width={180} height={120} />
            <span><strong>{model.code}</strong><small>{model.status}</small></span>
          </a>)}
        </div>
      </nav>

      <section className={styles.section + " " + styles.modelSection} aria-labelledby="models-title" id="models">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>{t("catalog.bikes.models.kicker")}</p><h2 id="models-title">{t("catalog.bikes.models.title")}</h2></div>
          <p>{t("catalog.bikes.models.body")}</p>
        </div>
        <div className={styles.modelLayout}>
          <BikesModelSideNavigator title={t("catalog.bikes.modelNav.series")} links={modelSideLinks} />
          <div className={styles.modelContent}>
            <div className={styles.catalogToolbar}>
              <nav className={styles.filters} aria-label={t("catalog.bikes.filter.label")}>
                <a href={prefix + "/bikes?sort=" + sortMode + "#models"} aria-current={!active ? "page" : undefined}>{t("catalog.bikes.filter.all")}</a>
                {platformIds.map(id => <a key={id} href={prefix + "/bikes?platform=" + id + "&sort=" + sortMode + "#models"} aria-current={active === id ? "page" : undefined}>{id.toUpperCase()}</a>)}
              </nav>
              <div className={styles.sortControl} role="group" aria-label={t("catalog.bikes.sort.label")}>
                <span><strong>{filteredModels.length}</strong> {t("catalog.bikes.sort.results")}</span>
                <a href={prefix + "/bikes?sort=featured" + (active ? "&platform=" + active : "") + "#models"} aria-current={sortMode === "featured" ? "page" : undefined}>{t("catalog.bikes.sort.featured")}</a>
                <a href={prefix + "/bikes?sort=name" + (active ? "&platform=" + active : "") + "#models"} aria-current={sortMode === "name" ? "page" : undefined}>{t("catalog.bikes.sort.name")}</a>
              </div>
            </div>
            {!publicCatalog.available?<p className={styles.emptyNotice} role="status">{t("catalog.bikes.models.unavailable")}</p>:null}
            {(!active || active === "fc") && models.length ? <BikesDiscovery locale={locale} models={filteredModels} sortMode={sortMode} /> : active && active !== 'fc' ? <div className={styles.empty}>
              <span>{active.toUpperCase()} PLATFORM</span>
              <h3>{t(`platform.${active}.title` as TranslationKey)}</h3>
              <p>{t("catalog.bikes.models.none")}</p>
              <a href={prefix + "/explore/" + active}>{t("catalog.bikes.platforms.link")}</a>
            </div> : null}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="platforms-title" id="platforms">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>{t("catalog.bikes.platforms.kicker")}</p><h2 id="platforms-title">{t("catalog.bikes.platforms.title")}</h2></div>
          <p>{t("catalog.bikes.platforms.body")}</p>
        </div>
        <div className={styles.platformGrid}>
          {platformIds.map(id => <a className={styles.platformCard} key={id} href={prefix + "/explore/" + id}>
            <img src={platformAssets[id]} width={1536} height={1024} alt="" loading="lazy" />
            <span className={styles.platformShade} />
            <div className={styles.platformText}><span>{t(`platform.${id}.code` as TranslationKey)}</span><h3>{t(`platform.${id}.title` as TranslationKey)}</h3><small>{t("catalog.bikes.platforms.link")}</small></div>
          </a>)}
        </div>
      </section>

      <section className={styles.guide}>
        <div><p className={styles.kicker}>{t("catalog.bikes.compare.kicker")}</p><h2>{t("catalog.bikes.compare.title")}</h2><p>{t("catalog.bikes.compare.body")}</p><a href="#accessories">{t("catalog.bikes.compare.cta")}</a></div>
        <div className={styles.guideTable} role="table" aria-label={t("catalog.bikes.compare.title")}>
          <div role="row" className={styles.guideHead}><span role="columnheader">{t("catalog.bikes.compare.model")}</span><span role="columnheader">{t("catalog.bikes.compare.platform")}</span><span role="columnheader">{t("catalog.bikes.compare.state")}</span></div>
          {models.map(model => <a role="row" key={model.id} href={prefix + "/explore/" + model.id}><strong role="cell">{model.name}</strong><span role="cell">FC</span><span role="cell">{model.status}</span></a>)}
        </div>
      </section>
      <section className={styles.collectionHelp} aria-labelledby="bikes-help-title" data-bikes-help>
        <div>
          <p className={styles.kicker}>{t("catalog.discovery.help.kicker")}</p>
          <h2 id="bikes-help-title">{t("catalog.discovery.help.title")}</h2>
          <nav aria-label={t("catalog.discovery.help.links")}>
            <a href={prefix + "/dealers"}>{t("catalog.discovery.help.dealers")} →</a>
            <a href={prefix + "/service-locations"}>{t("catalog.discovery.help.service")} →</a>
          </nav>
        </div>
        <div className={styles.collectionQuestions}>
          {(["purchase", "colours", "facts"] as const).map(topic => <details key={topic}>
            <summary>{t(`catalog.discovery.help.${topic}.question` as TranslationKey)}</summary>
            <p>{t(`catalog.discovery.help.${topic}.answer` as TranslationKey)}</p>
          </details>)}
        </div>
      </section>
      <AccessoriesCatalogSection locale={locale} selectedCategory={query.category} publishedProducts={publishedProducts} />
      <aside className={styles.shopPreviewEntry} data-shop-preview-entry>
        <div><strong>{t('shopPreview.linkLabel')}</strong><p>{t('shopPreview.linkBody')}</p></div>
        <a href={prefix + '/shop-preview'}>{t('shopPreview.open')} →</a>
      </aside>
      <div className={styles.preview}>{t("catalog.shared.preview")}</div>
    </main>
  </CatalogShell>;
}
