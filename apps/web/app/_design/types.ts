/** Admin screen metadata for real, authenticated business workspaces.
 * Demo blocks/KPI tables and imported Ardot records are deliberately unsupported.
 */
export interface Screen {
  id: string;
  area: string;
  route: string;
  title: string;
  subtitle: string;
  sourceNode?: string;
  actions?: string[];
  secondary?: { group: string; items: string[] }[];
  steps?: { label: string; href: string }[];
  blocks: readonly never[];
}
