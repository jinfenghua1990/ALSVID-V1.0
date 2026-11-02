const INTERNAL_PORTALS = new Set(['admin', 'dealer', 'supplier', 'service']);

export function sessionCookieName(request: Request, portal?: string): 'alsvid_session' | 'alsvid_my_session' {
  const host = ((request.headers.get('host') ?? '').split(':')[0] ?? '').toLowerCase();
  return sessionCookieNameForHost(host, portal);
}

export function sessionCookieNameForHost(host: string, portal?: string): 'alsvid_session' | 'alsvid_my_session' {
  const normalizedHost = host.trim().toLowerCase().split(':')[0] ?? '';
  return portal === 'my' || normalizedHost.split('.')[0] === 'my' ? 'alsvid_my_session' : 'alsvid_session';
}

/** API /v1/my/* has a dedicated owner session even on localhost/run.app/preview hosts.
 * Routing is a trusted, server-defined endpoint; never accept a browser-selected portal header.
 */
export function sessionCookieNameForApiRequest(host: string, apiPath: string): 'alsvid_session' | 'alsvid_my_session' {
  const pathname = apiPath.split('?')[0] ?? '';
  if (pathname === '/v1/my' || pathname.startsWith('/v1/my/')) return 'alsvid_my_session';
  return sessionCookieNameForHost(host);
}

export function sessionCookieNameForPortal(portal: string): 'alsvid_session' | 'alsvid_my_session' {
  return portal === 'my' ? 'alsvid_my_session' : 'alsvid_session';
}

export function sessionCookieOptions(request: Request, expiresAt?: Date): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  domain?: string;
  expires?: Date;
} {
  const host = ((request.headers.get('host') ?? '').split(':')[0] ?? '').toLowerCase();
  const portal = host.split('.')[0] ?? '';
  // Only the verified ALSVID domain may share an internal-portal cookie.
  // Retired ChaiBen / ALSVID alias hosts must never receive cross-subdomain
  // session cookie scopes. Local, preview and run.app hosts use host-only cookies.
  const domain = INTERNAL_PORTALS.has(portal) && host.endsWith('.alsvidbike.com')
    ? '.alsvidbike.com'
    : undefined;

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.ALSVID_COOKIE_SECURE !== 'false',
    path: '/',
    ...(domain ? { domain } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function expiredSessionCookieOptions(request: Request): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  domain?: string;
  maxAge: 0;
} {
  return {
    ...sessionCookieOptions(request),
    maxAge: 0,
  };
}
