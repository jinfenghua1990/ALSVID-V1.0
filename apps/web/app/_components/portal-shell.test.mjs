import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('./portal-shell.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../_design/admin-navigation.ts', import.meta.url), 'utf8');

test('only the canonical Admin navigation can contain internal Admin modules', () => {
  assert.match(admin, /ADMIN_SECONDARY_NAVIGATION/);
  assert.doesNotMatch(shell, /adminPrimaryNavigation|isAdminPrimaryActive|kind === 'admin'/);
  assert.doesNotMatch(shell, /admin:\s*\{/);
  assert.match(shell, /export type PortalKind = 'dealer' \| 'supplier' \| 'my'/);
});
test('dealer, supplier and owner portals keep their active real navigations', () => {
  for (const kind of ['dealer','supplier','my']) {
    assert.match(shell, new RegExp('\\b' + kind + ':\\s*\\{'));
  }
  assert.match(shell, /currentHref === href/);
  assert.match(shell, /<NavEntry item=\{item\}/);
});
