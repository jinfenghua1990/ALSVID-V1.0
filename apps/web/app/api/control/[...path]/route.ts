import { NextResponse } from 'next/server';
import { backendFetch } from '../../_lib/backend';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  const sourceUrl = new URL(request.url);
  const targetPath = `/${path.map(encodeURIComponent).join('/')}${sourceUrl.search}`;
  const method = request.method;
  if (method === 'PUT' && path.join('/') === 'v1/commerce/storefront/layout-draft') {
    const origin = request.headers.get('origin');
    try {
      if (!origin || new URL(origin).host !== sourceUrl.host) {
        return NextResponse.json({ message: 'Origin rejected' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: 'Origin rejected' }, { status: 403 });
    }
  }
  const init: RequestInit = { method };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.text();
  }
  const response = await backendFetch(targetPath, init);
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
// Without this export Next.js answers DELETE with an empty 405, which surfaces in
// the browser as "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
export const DELETE = proxy;
