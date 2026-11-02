/** Historical duplicate migration numbers are pinned to their original filenames and order.
 * Applied migrations are checksum- and filename-addressed; never rename old files.
 */
export const LEGACY_DUPLICATE_MIGRATIONS: Readonly<Record<string, readonly string[]>> = {
  '0021': ['0021_identity_phone_login.sql', '0021_portal_identity_roles.sql'],
  '0025': ['0025_marketing_product_colour_preferences.sql', '0025_service_case_foundation.sql'],
  '0030': ['0030_commerce_refund_review_foundation.sql', '0030_product_platform_naming.sql'],
  '0032': ['0032_build_spec_model_consistency.sql', '0032_dealer_partnership_intake.sql'],
};

export function orderedMigrationFiles(entries: readonly string[]): string[] {
  const sql = entries.filter(filename => filename.endsWith('.sql'));
  const groups = new Map<string, string[]>();
  for (const filename of sql) {
    const parsed = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(filename);
    if (!parsed) throw new Error('Invalid migration filename: ' + filename);
    const number = parsed[1]!;
    groups.set(number, [...(groups.get(number) ?? []), filename]);
  }
  for (const [number, filenames] of groups) {
    const legacy = LEGACY_DUPLICATE_MIGRATIONS[number];
    if (filenames.length > 1 || legacy) {
      if (!legacy || legacy.length !== filenames.length || legacy.some(file => !filenames.includes(file))) {
        throw new Error('Unpinned or renamed duplicate migration number ' + number + ': ' + filenames.join(', '));
      }
    }
  }
  for (const [number, legacy] of Object.entries(LEGACY_DUPLICATE_MIGRATIONS)) {
    if ((groups.get(number)?.length ?? 0) !== legacy.length) {
      throw new Error('Missing historical migration(s) for ' + number);
    }
  }
  return sql.sort((a, b) => {
    const aNumber = a.slice(0, 4), bNumber = b.slice(0, 4);
    if (aNumber !== bNumber) return Number(aNumber) - Number(bNumber);
    const pinned = LEGACY_DUPLICATE_MIGRATIONS[aNumber];
    return pinned ? pinned.indexOf(a) - pinned.indexOf(b) : a.localeCompare(b);
  });
}
