import { PublicSiteHeader } from "../public-site-header";
import { translator, type Locale } from "../../_lib/i18n";
import { l8Reference as data } from "../../_lib/products/l8";
import { L8Gallery } from "./l8-gallery";
import styles from "./l8-product.module.css";

export function L8LaunchCard({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return <section className={styles.launch} data-l8-launch>
    <div className={styles.launchCopy}>
      <p className={styles.eyebrow}>{t("l8.eyebrow")}</p>
      <h2>{t("brand.name")} {t("l8.model")}</h2>
      <p>{t("l8.launch.body")}</p>
      <a className={styles.button} href={`/${locale}/explore/l1`}>{t("l8.explore")}</a>
    </div>
    <a className={styles.launchVisual} href={`/${locale}/explore/l1`} aria-label={t("l8.explore")}>
      <span className={styles.backdrop} aria-hidden="true">L1</span>
      <img src="/products/l8/retouched-side.webp" width={1024} height={1024} alt={t("l8.gallery.side.alt")} loading="lazy" />
    </a>
  </section>;
}

export function L8ProductPage({ locale, myUrl }: { locale: Locale; myUrl: string }) {
  const t = translator(locale);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const energy = data.batteryVoltageV * data.batteryCapacityAh;
  const specs = [
    [t("l8.spec.frame"), t("l8.spec.frame.value")],
    [t("l8.spec.wheels"), t("l8.spec.wheels.value", { size: number(data.wheelInches), width: number(data.tyreWidthInches) })],
    [t("l8.spec.motor"), t("l8.spec.motor.value", { power: number(data.motorPowerW) })],
    [t("l8.spec.torque"), number(data.maxTorqueNm) + " Nm"],
    [t("l8.spec.sensor"), t("l8.spec.sensor.value")],
    [t("l8.spec.battery"), t("l8.spec.battery.value", { voltage: number(data.batteryVoltageV), capacity: number(data.batteryCapacityAh), energy: number(energy) })],
    [t("l8.spec.suspension"), t("l8.spec.suspension.value")],
    [t("l8.spec.drivetrain"), t("l8.spec.drivetrain.value")],
    [t("l8.spec.brakes"), t("l8.spec.brakes.value")],
  ];
  return <main className={styles.page} lang={locale} data-l8-product="1">
    <PublicSiteHeader locale={locale} myUrl={myUrl} active="l8" />
    <section className={styles.hero} id="overview">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{t("l8.eyebrow")}</p>
        <h1><small>{t("brand.name")}</small>{t("l8.model")}</h1>
        <h2>{t("l8.headline")}</h2>
        <p>{t("l8.intro")}</p>
        <a className={styles.button} href="#design">{t("l8.details")}</a>
      </div>
      <L8Gallery locale={locale} />
    </section>
    <div className={styles.metricsWrap}>
      <p className={styles.eyebrow}>{t("l8.reference")}</p>
      <dl className={styles.metrics}>
        {[
          [number(data.wheelInches) + "″", t("l8.metric.wheels")],
          [number(data.motorPowerW) + " W", t("l8.metric.power")],
          [number(data.maxTorqueNm) + " Nm", t("l8.metric.torque")],
          [number(energy) + " Wh", t("l8.metric.battery")],
        ].map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </div>
    <nav className={styles.chapterNav} aria-label={t("l8.details")}>
      <a href="#design">{t("l8.nav.design")}</a><a href="#folding">{t("l8.nav.folding")}</a>
      <a href="#specifications">{t("l8.nav.specs")}</a><a href="#availability">{t("l8.nav.availability")}</a>
    </nav>
    <section className={styles.section} id="design">
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>{t("l8.design.kicker")}</p><h2>{t("l8.design.title")}</h2></div>
      <div className={styles.features}>
        <article className={styles.carbon}>
          <span className={styles.featureNumber} aria-hidden="true">01</span>
          <h3>{t("l8.carbon.title")}</h3><p>{t("l8.carbon.body")}</p>
          <img src="/products/l8/retouched-side.webp" width={1024} height={1024} alt={t("l8.gallery.side.alt")} loading="lazy" />
        </article>
        <article className={styles.assist}>
          <span className={styles.featureNumber} aria-hidden="true">02</span>
          <strong>{number(data.maxTorqueNm)}<small> Nm</small></strong>
          <h3>{t("l8.assist.title")}</h3><p>{t("l8.assist.body", { torque: number(data.maxTorqueNm) })}</p>
        </article>
        <article className={styles.suspension}>
          <span className={styles.featureNumber} aria-hidden="true">03</span>
          <h3>{t("l8.suspension.title")}</h3><p>{t("l8.suspension.body")}</p>
        </article>
      </div>
    </section>
    <section className={styles.fold} id="folding">
      <div className={styles.foldVisual}><img src="/products/l8/retouched-folded.webp" width={2560} height={2560} alt={t("l8.gallery.folded.alt")} loading="lazy" /></div>
      <div className={styles.foldCopy}><p className={styles.eyebrow}>{t("l8.fold.kicker")}</p><h2>{t("l8.fold.title")}</h2><p>{t("l8.fold.body")}</p></div>
    </section>
    <section className={styles.section} id="specifications">
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>{t("l8.reference")}</p><h2>{t("l8.spec.title")}</h2><p>{t("l8.spec.note")}</p></div>
      <dl className={styles.specs}>{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <a className={styles.source} href={data.sourceUrl} target="_blank" rel="noreferrer">{t("l8.spec.source")}</a>
    </section>
    <section className={styles.availability} id="availability">
      <div><p className={styles.eyebrow}>{t("l8.available.kicker")}</p><h2>{t("l8.available.title")}</h2><p>{t("l8.available.body")}</p>
        <a className={styles.button} href={`/${locale}/bikes`}>{t("l8.products")}</a></div>
      <span aria-hidden="true">L1</span>
    </section>
    <footer className={styles.footer}><a href={`/${locale}/`}>{t("brand.name")}</a><p>{t("l8.footer")}</p><a href={`/${locale}/`}>{t("l8.home")}</a></footer>
  </main>;
}
