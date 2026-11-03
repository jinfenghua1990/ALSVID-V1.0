import { NextResponse } from 'next/server';
import { backendFetch } from '../../../_lib/backend';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const response = await backendFetch(`/v1/partners/${encodeURIComponent(id)}/factories`);
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const response = await backendFetch(`/v1/partners/${encodeURIComponent(id)}/factories`, { method: 'PUT', body: await request.text() });
  return NextResponse.json(await response.json(), { status: response.status });
}
