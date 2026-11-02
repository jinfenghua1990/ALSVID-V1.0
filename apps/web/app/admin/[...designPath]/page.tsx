import { notFound, redirect } from 'next/navigation';

// Old Ardot design snapshots are retired. Unknown nested Admin URLs must
// never load demonstration screens or fake business records. Preserve
// bookmarked nested links by returning to the actual live parent workspace.
const liveParents: Readonly<Record<string, string>> = {
  product: '/admin/product',
  orders: '/admin/orders',
  production: '/admin/production',
  inventory: '/admin/inventory',
  dealers: '/admin/dealers',
  customers: '/admin/customers',
  'after-sales': '/admin/after-sales',
  supply: '/admin/supply',
  analytics: '/admin/analytics',
  settings: '/admin/settings',
  ecommerce: '/admin/ecommerce',
  finance: '/admin/finance',
  logistics: '/admin/logistics',
};

export default async function ArchivedAdminUrl({ params }: { params: Promise<{ designPath: string[] }> }) {
  const { designPath } = await params;
  const destination = designPath.length > 1 ? liveParents[designPath[0] ?? ''] : undefined;
  if (!destination) notFound();
  redirect(destination);
}
