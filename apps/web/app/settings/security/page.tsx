import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { navigationFor } from '../../_design/admin-navigation';
import { SecurityPolicyEditor } from './security-policy-editor';

export default async function SecuritySettingsPage() {
  await requireInternalPreviewSession();
  return (
    <AppShell navigation={navigationFor('/settings/security')} footer="ALSVID · 系统设置">
      <SecurityPolicyEditor />
    </AppShell>
  );
}
