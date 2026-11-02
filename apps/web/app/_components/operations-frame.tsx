import type { ReactNode } from 'react';
import { AppShell } from '@alsvid/ui';
import { navigationFor } from '../_design/admin-navigation';

/**
 * Keep the proven domain-connected workspaces usable in their old routes while
 * migrating their presentation into the canonical /admin UI. Neither mode
 * changes the domain API or owns a second set of business facts.
 */
export function OperationsFrame({
  embedded = false,
  area,
  footer,
  children,
  classNames,
}: {
  embedded?: boolean;
  area: 'product' | 'commerce' | 'production' | 'inventory' | 'dealers' | 'supply' | 'finance' | 'logistics';
  footer: string;
  children: ReactNode;
  classNames?: { workspace?: string };
}) {
  if (embedded) {
    return <div className={`av-live-operations ${classNames?.workspace ?? ''}`} data-area={area} aria-label="真实业务操作区">{children}</div>;
  }
  return <AppShell navigation={navigationFor('/' + area)} footer={footer} {...(classNames ? { classNames } : {})}>{children}</AppShell>;
}

