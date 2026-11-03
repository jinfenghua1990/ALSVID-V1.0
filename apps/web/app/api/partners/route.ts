import { NextResponse } from 'next/server';
import { backendFetch } from '../_lib/backend';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const role = url.searchParams.get('role') ?? '';
  const suffix = role ? `&role=${encodeURIComponent(role)}` : '';
  const response = await backendFetch(`/v1/partners?q=${encodeURIComponent(query)}${suffix}`);
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const response = await backendFetch('/v1/partners', { method: 'POST', body: await request.text() });
  return NextResponse.json(await response.json(), { status: response.status });
}
