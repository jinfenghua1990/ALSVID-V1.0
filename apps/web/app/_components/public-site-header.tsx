import { LanguageSwitcher } from './language-switcher';
import { CartHeaderLink } from './commerce/cart-header-link';
import { OwnerServiceMenu } from './owner-service-menu';
import { translator, type Locale } from '../_lib/i18n';
import styles from './public-site-header.module.css';

type Section = 'fc1' | 'fc2' | 'l7' | 'l8' | 'bikes' | 'dealers' | 'story';

/** ALSVID WWW navigation has the same structure and breakpoint behavior as the homepage.
 *  Portal dashboards keep their own independent navigation. */
export function PublicSiteHeader({
  locale,
  myUrl = 'https://my.alsvidbike.com',
  active,
  home = false,
  dealerLogin = false,
}: {
  locale: Locale;
  myUrl?: string;
  active?: Section | undefined;
  home?: boolean;
  dealerLogin?: boolean;
}) {
  const t = translator(locale);
  const prefix = '/' + locale;
  const dealerLoginUrl = 'https://dealer.alsvidbike.com/login?portal=dealer&locale=' + locale + '&open=1';
  const links = [
    { href: prefix + '/explore/fc1', label: t('product.model_fc1'), id: 'fc1', badge: t('navigation.reserve_badge') },
    { href: prefix + '/explore/fc2', label: t('fc2.model'), id: 'fc2', badge: t('product.new_badge') },
    { href: prefix + '/explore/l7', label: t('l7.model'), id: 'l7' },
    { href: prefix + '/explore/l1', label: t('l8.model'), id: 'l8' },
    { href: prefix + '/bikes', label: t('navigation.products'), id: 'bikes' },
    { href: prefix + '/dealers', label: t('navigation.global_dealers'), id: 'dealers' },
    { href: myUrl, label: t('network.nav.owner'), id: 'owner' },
    { href: prefix + '/explore/about-story', label: t('brand.story'), id: 'story' },
  ];
  const menu = (mobile: boolean) => links.map(link => (
    link.id === 'owner' ? <OwnerServiceMenu key={link.href} locale={locale} myUrl={myUrl} mobile={mobile} /> :
    <a key={link.href} href={link.href}
      aria-current={active && link.id === active ? 'page' : undefined}
      className={mobile ? styles.mobileLink : styles.navLink}>
      {link.label}
      {'badge' in link && link.badge
        ? <span className={link.id === 'fc1' ? styles.reserveBadge : styles.newBadge}>{link.badge}</span>
        : null}
    </a>
  ));
  return <header className={[styles.header, home ? styles.homeOverlay : ''].filter(Boolean).join(' ')} data-public-site-header>
    <a className={styles.logo} href={prefix + '/'} aria-label="ALSVID">
      <span className={styles.brandLine}>
        <img className={styles.brandBike} src="/home/alsvid-bike-motion.svg" alt="" width={74} height={42} />
        <span>ALSVID</span>
      </span>
      <span className={styles.strapline}>{t('announcement')}</span>
    </a>
    <nav className={styles.desktopNav} aria-label={t('navigation.primary')}>{!home && <a className={styles.homeLink} href={prefix + '/'}>{t('common.back_home')}</a>}{menu(false)}</nav>
    <div className={styles.actions}>
      {dealerLogin && <a className={styles.dealerApply} href={prefix + '/dealers?apply=1'}>{t('network.nav.apply')}</a>}
      {dealerLogin && <a className={styles.dealerLogin} href={dealerLoginUrl}>{t('network.nav.account')}</a>}
      <CartHeaderLink locale={locale}/>
      <LanguageSwitcher locale={locale} label={t('language.label')} variant="globe" />
    </div>
    <details className={styles.mobileMenu}>
      <summary aria-label={t('navigation.mobile_menu')} title={t('navigation.mobile_menu')}>☰</summary>
      <nav aria-label={t('navigation.primary')}>
        {!home && <a className={styles.mobileLink} href={prefix + '/'}>{t('common.back_home')}</a>}
        {menu(true)}
        {dealerLogin && <a className={styles.mobileLink} href={prefix + '/dealers?apply=1'}>{t('network.nav.apply')}</a>}
        {dealerLogin && <a className={styles.mobileLink} href={dealerLoginUrl}>{t('network.nav.account')}</a>}
        <CartHeaderLink locale={locale} mobile />
        <div className={styles.mobileLanguage}>
          <LanguageSwitcher locale={locale} label={t('language.label')} variant="inline" />
        </div>
      </nav>
    </details>
    <nav className={styles.mobileModels} aria-label={t('navigation.products')}>
      {links.slice(0, 4).map(link => <a key={link.href} href={link.href} aria-current={active && link.id === active ? "page" : undefined}>
        {link.label}
        {'badge' in link && link.badge ? <span className={link.id === 'fc1' ? styles.reserveBadge : styles.newBadge}>{link.badge}</span> : null}
      </a>)}
    </nav>
  </header>;
}
