import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { HomePage } from '../_components/home/home-page';
import { homepageProductBindings } from '../_components/home/public-product-bindings';
import { homepageLayout } from '../_components/home/public-home-layout';
import { isLocale } from '../_lib/i18n/routing';
import { translator } from '../_lib/i18n';
import { portalUrlFor } from '../_lib/portal-routing';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translator(locale);
  return { title: t('meta.title'), description: t('meta.description'), alternates: {
    canonical: `https://www.alsvidbike.com/${locale}/`, languages: { zh: 'https://www.alsvidbike.com/zh/', de: 'https://www.alsvidbike.com/de/', en: 'https://www.alsvidbike.com/en/' },
  } };
}
export default async function LocalizedHome({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? '';
  const prefix = host.toLowerCase().split('.')[0];
  if (prefix === 'admin' || prefix === 'my' || prefix === 'dealer') redirect(`/${prefix}`);
  // 装修版式与商品绑定互不依赖，并行取；装修接口失败时 layout 为 null，页面回退内置设计
  const [productBindings, layout] = await Promise.all([homepageProductBindings(), homepageLayout()]);
  return <HomePage locale={locale} myUrl={portalUrlFor(host, 'my')} dealerUrl={portalUrlFor(host, 'dealer')} productBindings={productBindings} layout={layout} />;
}
