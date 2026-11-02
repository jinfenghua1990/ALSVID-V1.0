import { cookies, headers } from 'next/headers';
import { isLocale, localeCookie } from './_lib/i18n/routing';
import { requestLocale } from './_lib/i18n/request-locale';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RefreshButton } from './_components/refresh-button';
import './globals.css';
import './admin-shell-v2.css';
import './admin-refinements.css';
import './theme.css';
import './admin-typography.css';

function runtimeEnvironment() {
  return process.env.ALSVID_ENV === 'production' ? 'production' : 'development';
}

export function generateMetadata(): Metadata {
  const environment = runtimeEnvironment();
  return {
    title: environment === 'production' ? 'ALSVID' : 'ALSVID（本地开发）',
    description: 'ALSVID 自行车业务与车辆生命周期管理平台',
  };
}

const themeBootstrap = `
try {
  const saved = localStorage.getItem('alsvid-theme');
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch (_) {}
`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const environment = runtimeEnvironment();
  const requestHeaders = await headers();
  const requestedLocale = requestHeaders.get('x-alsvid-locale');
  const savedLocale = (await cookies()).get(localeCookie)?.value;
  const locale = isLocale(requestedLocale)
    ? requestedLocale
    : requestLocale(savedLocale, requestHeaders);
  const isDevelopment = environment !== 'production';

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body data-alsvid-environment={environment}>
        {isDevelopment ? (
          <div className="environmentBanner" role="status">
            <strong>本地开发环境</strong>
            <span>非正式环境，当前数据不属于正式业务数据。</span>
            <RefreshButton />
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
