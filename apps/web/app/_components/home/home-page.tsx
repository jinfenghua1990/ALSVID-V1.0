import { HomePosterHero, FoldingSteps } from "./home-interactions";
import type { HomepageProductBindings } from './public-product-bindings';
import { PublicSiteHeader } from "../public-site-header";
import { translator, type Locale } from "../../_lib/i18n";
import cupStyles from "../product/cup-holder-product.module.css";
import styles from "./original-home.module.css";

export function HomePage({
  myUrl,
  dealerUrl,
  locale = "zh",
  productBindings,
}: {
  myUrl: string;
  dealerUrl: string;
  locale?: Locale;
  productBindings?: HomepageProductBindings;
}) {
  const t = translator(locale);
  const detail = (slug: string) => `/${locale}/explore/${slug}`;
  const shopUrl = detail("fc1");
  const catalogAccessoriesUrl = `/${locale}/bikes#accessories`;
  return (
    <main
      translate="no"
      id="top"
      className={`${styles.page} ${styles.posterHome}`}
      lang={locale}
      data-home-design="original-migration"
    >
      <PublicSiteHeader locale={locale} myUrl={myUrl} home />
      <HomePosterHero
        productModelId={productBindings?.FC1_HERO ?? null}
        title={t("hero.poster_title")}
        tagline={t("hero.poster_tagline")}
        discoverLabel={t("hero.poster_cta")}
        buyLabel={t("hero.poster_buy")}
        buyHref={shopUrl}
        posterAlt={t("hero.poster_alt")}
        modelLabel={t("hero.fc1_details")}
        modelHref={detail("fc1")}
        deliveryNote={t("hero.poster_delivery")}
        categories={[
          {href: detail("fc1"), label: t("platform.fc.title"), image: "/home/fc1-poster-clean.png", alt: t("hero.poster_alt")},
          {href: detail("ct"), label: t("platform.ct.title"), image: "/home/original/scene-city.webp", alt: t("images.city")},
          {href: detail("ft"), label: t("platform.ft.title"), image: "/home/original/scene-fat-tire.webp", alt: t("images.fat")},
          {href: detail("gt"), label: t("platform.gt.title"), image: "/home/original/scene-touring.webp", alt: t("images.touring")},
        ]}
        pauseLabel={t("hero.pause")}
        playLabel={t("hero.play")}
        conceptLabel={t("hero.platform_concept")}
        exploreLabel={t("hero.explore_platform")}
        scrollLabel={t("navigation.products")}
      />
      <section id="platforms" className={styles["section"] + " " + styles["home-product-collection"]} data-home-product-collection>
        <span id="featured" className={styles["home-product-anchor"]} aria-hidden="true" />
        <div className={styles["inner"]}>
          <div className={styles["section-head"]}>
            <div>
              <div className={styles["eyebrow"]} style={{ color: "#808783" }}>
                {t("catalog.bikes.models.kicker")}
              </div>
              <h2>{t("catalog.bikes.models.title")}</h2>
            </div>
            <p>{t("catalog.bikes.models.body")}</p>
            <a className={styles["text-link"]} href={"/" + locale + "/bikes"}>{t("catalog.nav.bikes")} <span aria-hidden="true">→</span></a>
          </div>
          <div className={styles["home-product-grid"]}>
            {[
              { code: "A1-ULTRA", name: t("product.model_fc1"), platform: t("platform.fc.title"), image: "/home/original/fc1-product.webp", alt: t("images.product"), href: detail("fc1"), modelId: productBindings?.FC1_FEATURED ?? productBindings?.FC1_HERO ?? undefined },
              { code: "L1-PRO", name: t("fc2.model"), platform: t("platform.fc.title"), image: "/products/fc2/side-studio-1536.webp", alt: t("fc2.gallery.alt.side"), href: detail("fc2"), modelId: productBindings?.FC2_LAUNCH ?? undefined },
              { code: "A1", name: t("l7.model"), platform: t("platform.fc.title"), image: "/products/l7/reference-side.jpg", alt: t("l7.gallery.side.alt"), href: detail("l7"), modelId: undefined },
              { code: "L1", name: t("l8.model"), platform: t("platform.fc.title"), image: "/products/l8/retouched-side.webp", alt: t("l8.gallery.side.alt"), href: detail("l1"), modelId: undefined },
            ].map(product => (
              <article className={styles["home-product-card"]} key={product.code} data-product-model-id={product.modelId}>
                <a href={product.href} className={styles["home-product-image"]} aria-label={product.name}>
                  <img src={product.image} alt={product.alt} width="1536" height="1024" loading="lazy" />
                </a>
                <div className={styles["home-product-info"]}>
                  <div className={styles["home-product-meta"]}>
                    <span className={styles["home-product-platform"]}>{product.platform}</span>
                    <span className={styles["home-product-code"]}>{product.code}</span>
                  </div>
                  <h3>{product.name}</h3>
                  <a className={styles["home-product-link"]} href={product.href}>
                    {t("catalog.bikes.models.details")} <span aria-hidden="true">→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="folding" className={styles["fold"]}>
        <div className={styles["inner"] + " " + styles["fold-grid"]}>
          <div className={styles["fold-copy"]}>
            <div className={styles["eyebrow"]} style={{ color: "#7a827f" }}>
              {t("folding.eyebrow")}
            </div>
            <h2>
              {t("folding.title_first")}
              <br />
              {t("folding.title_second")}
            </h2>
            <p>{t("folding.description")}</p>
            <a className={styles["text-link"]} href={detail("fc1")}>
              {t("folding.discover")}
            </a>
          </div>
          <FoldingSteps
            label={t("folding.aria")}
            steps={[
              {
                number: t("folding.step_1"),
                title: t("folding.riding"),
                description: t("interaction.folding.riding"),
              },
              {
                number: t("folding.step_2"),
                title: t("folding.folding"),
                description: t("interaction.folding.folding"),
              },
              {
                number: t("folding.step_3"),
                title: t("folding.storing"),
                description: t("interaction.folding.storing"),
              },
            ]}
          />
        </div>
      </section>
      <section id="tech" className={styles["section"] + " " + styles["tech"]}>
        <div className={styles["inner"]}>
          <div className={styles["section-head"]}>
            <div>
              <div className={styles["eyebrow"]} style={{ color: "#808783" }}>
                {t("technology.eyebrow")}
              </div>
              <h2>
                {t("technology.title_first")}
                <br />
                {t("technology.title_second")}
              </h2>
            </div>
            <p>{t("technology.description")}</p>
          </div>
          <div className={styles["tech-grid"]}>
            <article className={styles["tech-card"]}>
              <div className={styles.motionDetail}><img src="/home/alsvid-bike-motion.svg" alt="" width="156" height="88" loading="lazy" /></div>
              <h3>{t("technology.assist.title")}</h3>
              <p>{t("technology.assist.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("technology-assist")}
                aria-label={t("technology.assist.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["tech-card"]}>
              <div className={styles["tech-icon"]}>{t("icon.battery")}</div>
              <h3>{t("technology.battery.title")}</h3>
              <p>{t("technology.battery.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("technology-battery")}
                aria-label={t("technology.battery.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["tech-card"]}>
              <div className={styles["tech-icon"]}>{t("icon.folding")}</div>
              <h3>{t("technology.folding.title")}</h3>
              <p>{t("technology.folding.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("technology-folding")}
                aria-label={t("technology.folding.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["tech-card"]}>
              <div className={styles["tech-icon"]}>{t("icon.material")}</div>
              <h3>{t("technology.material.title")}</h3>
              <p>{t("technology.material.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("technology-material")}
                aria-label={t("technology.material.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["tech-card"]}>
              <div className={styles["tech-icon"]}>{t("icon.safety")}</div>
              <h3>{t("technology.safety.title")}</h3>
              <p>{t("technology.safety.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("technology-safety")}
                aria-label={t("technology.safety.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
          </div>
        </div>
      </section>
      <section
        id="accessories"
        className={styles["accessories"] + " " + styles["section"]}
      >
        <div className={styles["inner"]}>
          <div className={styles["section-head"]}>
            <div>
              <div className={styles["eyebrow"]} style={{ color: "#808783" }}>
                {t("accessories.eyebrow")}
              </div>
              <h2>{t("accessories.title")}</h2>
            </div>
            <p>{t("accessories.description")}</p>
            <a className={styles["text-link"]} href={catalogAccessoriesUrl} data-accessories-catalog-link>
              {t("accessories.browse")}
            </a>
          </div>
          <div id="accessory-categories" className={styles["accessory-grid"]}>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}><img className={cupStyles.thumbnail} src="/products/accessories/cup-holder/retouched/cup-holder-black.webp" width={800} height={800} alt={t("cup.black.alt")} loading="lazy" /></div>
              <h3>{t("cup.name")}</h3><p>{t("cup.home.body")}</p>
              <a className={styles.cardLink} href={detail("accessory-cup-holder")} aria-label={t("cup.explore")}>{t("common.learn_more")}</a>
            </article>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}>{t("icon.battery")}</div>
              <h3>{t("accessories.basket.title")}</h3>
              <p>{t("accessories.basket.description")}</p>
              <a
                className={styles.cardLink}
                href={detail("accessory-basket")}
                aria-label={t("accessories.basket.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}>{t("icon.rack")}</div>
              <h3>{t("accessories.rack.title")}</h3>
              <p>{t("accessories.rack.description")}</p>
              <a
                className={styles.cardLink}
                href={detail("accessory-rack")}
                aria-label={t("accessories.rack.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}>{t("icon.mudguard")}</div>
              <h3>{t("accessories.mudguard.title")}</h3>
              <p>{t("accessories.mudguard.description")}</p>
              <a
                className={styles.cardLink}
                href={detail("accessory-mudguard")}
                aria-label={t("accessories.mudguard.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}>{t("icon.assist")}</div>
              <h3>{t("accessories.light.title")}</h3>
              <p>{t("accessories.light.description")}</p>
              <a
                className={styles.cardLink}
                href={detail("accessory-light")}
                aria-label={t("accessories.light.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["accessory"]}>
              <div className={styles["visual"]}>{t("icon.parts")}</div>
              <h3>{t("accessories.parts.title")}</h3>
              <p>{t("accessories.parts.description")}</p>
              <a
                className={styles.cardLink}
                href={detail("accessory-parts")}
                aria-label={t("accessories.parts.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
          </div>
        </div>
      </section>
      <section id="service" className={styles["service"]}>
        <div className={styles["inner"] + " " + styles["service-grid"]}>
          <img
            className={styles["service-image"]}
            src="/home/original/scene-city.webp"
            alt={t("images.city")}
            width="1536"
            height="1024"
            loading="lazy"
          />
          <div className={styles["service-copy"]}>
            <div className={styles["brandline"]}>
              <h2>{t("services.title")}</h2>
              <a href={myUrl}>{t("brand.my_alsvid")}</a>
            </div>
            <p>{t("services.description")}</p>
            <div className={styles["service-list"]}>
              <a
                className={styles["service-item"]}
                href={new URL("/my/vehicles/register", myUrl).toString()}
              >
                <b>{t("services.registration.title")}</b>
                <span>{t("services.registration.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={new URL("/my/vehicles", myUrl).toString()}
              >
                <b>{t("services.vehicles.title")}</b>
                <span>{t("services.vehicles.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={new URL("/my/vehicles", myUrl).toString()}
              >
                <b>{t("services.vin.title")}</b>
                <span>{t("services.vin.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={new URL("/my/vehicles", myUrl).toString()}
              >
                <b>{t("services.warranty.title")}</b>
                <span>{t("services.warranty.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={new URL("/my/service", myUrl).toString()}
              >
                <b>{t("services.repair.title")}</b>
                <span>{t("services.repair.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={new URL("/my/library", myUrl).toString()}
              >
                <b>{t("services.manuals.title")}</b>
                <span>{t("services.manuals.body")}</span>
              </a>
              <a
                className={styles["service-item"]}
                href={"/" + locale + "/service-locations"}
              >
                <b>{t("services.locations.title")}</b>
                <span>{t("services.locations.body")}</span>
              </a>
            </div>
            <a className={styles["btn-dark"]} href={myUrl}>
              {t("services.open")}
            </a>
          </div>
        </div>
      </section>
      <section id="about" className={styles["about"] + " " + styles["section"]}>
        <div className={styles["inner"]}>
          <div className={styles["section-head"]}>
            <div>
              <div className={styles["eyebrow"]} style={{ color: "#808783" }}>
                {t("about.eyebrow")}
              </div>
              <h2>{t("about.title")}</h2>
            </div>
            <a className={styles["text-link"]} href={detail("about-story")}>
              {t("about.more")}
            </a>
          </div>
          <div className={styles["about-grid"]}>
            <article className={styles["about-card"]}>
              <h3>{t("brand.story")}</h3>
              <p>{t("about.story.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("about-story")}
                aria-label={t("brand.story")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["about-card"]}>
              <h3>{t("about.design.title")}</h3>
              <p>{t("about.design.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("about-design")}
                aria-label={t("about.design.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["about-card"]}>
              <h3>{t("about.engineering.title")}</h3>
              <p>{t("about.engineering.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("about-engineering")}
                aria-label={t("about.engineering.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["about-card"]}>
              <h3>{t("about.manufacturing.title")}</h3>
              <p>{t("about.manufacturing.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("about-manufacturing")}
                aria-label={t("about.manufacturing.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
            <article className={styles["about-card"]}>
              <h3>{t("about.news.title")}</h3>
              <p>{t("about.news.body")}</p>
              <a
                className={styles.cardLink}
                href={detail("about-news")}
                aria-label={t("about.news.title")}
              >
                {t("common.learn_more")}
              </a>
            </article>
          </div>
        </div>
      </section>
      <section id="dealer" className={styles["dealer"]}>
        <img
          className={styles["dealer-bg"]}
          src="/home/original/scene-touring.webp"
          alt={t("images.touring")}
          width="1536"
          height="1024"
          loading="lazy"
        />
        <div className={styles["dealer-shade"]}></div>
        <div className={styles["copy"]}>
          <div className={styles["eyebrow"]}>{t("dealer.eyebrow")}</div>
          <h2>
            {t("dealer.title_first")}
            <br />
            {t("dealer.title_second")}
          </h2>
          <p>{t("dealer.description")}</p>
          <a className={styles["btn-white"]} href={"/" + locale + "/dealers?apply=1"}>
            {t("dealer.apply")}
          </a>
          <a className={styles["btn-outline"]} href={dealerUrl}>
            {t("dealer.login")}
          </a>
        </div>
      </section>
      <footer className={styles["footer"]}>
        <div className={styles["footer-grid"]}>
          <div className={styles["footer-brand"]}>
            <div className={styles.footerMotionBrand}><img src="/home/alsvid-bike-motion.svg" alt="" width="80" height="46" loading="lazy" /><b>{t("brand.name")}</b></div>
            <p>{t("brand.tagline")}</p>
          </div>
          <div className={styles["footer-col"]}>
            <h4>{t("footer.bikes")}</h4>
            <a href={detail("l7")}>{t("l7.model")}</a>
            <a href={detail("l1")}>{t("l8.model")}</a>
            <a href={detail("fc2")}>{t("fc2.model")}</a>
            <a href={detail("fc1")}>{t("product.model_fc1")}</a>
            <a href={detail("fc")}>{t("footer.fc")}</a>
            <a href={detail("ct")}>{t("footer.ct")}</a>
            <a href={detail("ft")}>{t("footer.ft")}</a>
            <a href={detail("gt")}>{t("footer.gt")}</a>
          </div>
          <div className={styles["footer-col"]}>
            <h4>{t("footer.accessories")}</h4>
            <a href={catalogAccessoriesUrl} data-accessories-catalog-link>{t("footer.accessory_overview")}</a>
            <a href={detail("accessory-basket")}>
              {t("accessories.basket.title")}
            </a>
            <a href={detail("accessory-rack")}>{t("accessories.rack.title")}</a>
            <a href={detail("accessory-light")}>{t("footer.lights")}</a>
          </div>
          <div className={styles["footer-col"]}>
            <h4>{t("services.title")}</h4>
            <a href={myUrl}>{t("brand.my_alsvid")}</a>
            <a href={myUrl}>{t("services.registration.title")}</a>
            <a href={myUrl}>{t("services.warranty.title")}</a>
            <a href={myUrl}>{t("services.manuals.title")}</a>
            <a href={"/" + locale + "/service-locations"}>{t("services.locations.title")}</a>
          </div>
          <div className={styles["footer-col"]}>
            <h4>{t("footer.about")}</h4>
            <a href={detail("about-story")}>{t("brand.story")}</a>
            <a href={detail("about-design")}>{t("about.design.title")}</a>
            <a href={detail("about-engineering")}>
              {t("about.engineering.title")}
            </a>
            <a href={detail("about-manufacturing")}>
              {t("about.manufacturing.title")}
            </a>
          </div>
          <div className={styles["footer-col"]}>
            <h4>{t("footer.contact")}</h4>
            <a href={"/" + locale + "/dealers"}>{t("footer.dealer")}</a>
            <a href={"/" + locale + "/dealers?apply=1"}>{t("footer.apply")}</a>
            <a href={new URL("/my/service", myUrl).toString()}>
              {t("footer.contact_us")}
            </a>
          </div>
        </div>
        <div className={styles["footer-bottom"]}>
          <span>
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </span>
          <span>{t("footer.legal")}</span>
        </div>
      </footer>
      <div className={styles["notice"]}>{t("notice")}</div>
    </main>
  );
}
