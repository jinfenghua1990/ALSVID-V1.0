import type { DatabasePort } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import type { CommerceAuditPort } from './application/ports.js';
import { CommerceConflictError, CommerceValidationError } from './core/errors.js';
import type { StorefrontActor } from './storefront-orders.js';

type DraftRow = { project: Record<string, unknown>; version: number; updated_at: Date };

export class StorefrontLayoutService {
  constructor(private readonly db: DatabasePort, private readonly audit: CommerceAuditPort) {}

  async read(actor: StorefrontActor) {
    this.requirePermission(actor, 'commerce.storefront.read');
    const result = await this.db.query<DraftRow>(
      "SELECT project, version, updated_at FROM commerce.storefront_layout_drafts WHERE page_key = 'homepage'",
    );
    const row = result.rows[0];
    return row ? { project: row.project, version: row.version, updatedAt: row.updated_at.toISOString() } : null;
  }

  async save(actor: StorefrontActor, input: { project: unknown; expectedVersion: unknown }) {
    this.requirePermission(actor, 'commerce.storefront.write');
    if (!input || !input.project || typeof input.project !== 'object' || Array.isArray(input.project))
      throw new CommerceValidationError('Project must be a JSON object');
    if (!Number.isInteger(input.expectedVersion) || (input.expectedVersion as number) < 0)
      throw new CommerceValidationError('Expected version must be a non-negative integer');
    const serialized = JSON.stringify(input.project);
    if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024)
      throw new CommerceValidationError('Project exceeds the 2 MB limit');
    const expected = input.expectedVersion as number;
    return this.db.transaction(async executor => {
      const result = expected === 0
        ? await executor.query<DraftRow>(
          "INSERT INTO commerce.storefront_layout_drafts (page_key, project, updated_by) VALUES ('homepage', $1::jsonb, $2) ON CONFLICT DO NOTHING RETURNING project, version, updated_at",
          [serialized, actor.userId],
        )
        : await executor.query<DraftRow>(
          "UPDATE commerce.storefront_layout_drafts SET project = $1::jsonb, updated_by = $2, updated_at = now(), version = version + 1 WHERE page_key = 'homepage' AND version = $3 RETURNING project, version, updated_at",
          [serialized, actor.userId, expected],
        );
      const row = result.rows[0];
      if (!row) throw new CommerceConflictError('Draft changed since it was loaded; reload before saving');
      await this.audit.record({ actorUserId: actor.userId, action: 'commerce.storefront_layout_saved', targetType: 'commerce.storefront_layout', targetId: 'homepage', metadata: { version: row.version } }, executor);
      return { project: row.project, version: row.version, updatedAt: row.updated_at.toISOString() };
    });
  }

  private requirePermission(actor: StorefrontActor, permission: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenError('COMMERCE_FORBIDDEN', `Missing ${permission}`);
  }
}

/** 外部装修系统（ALSVID 8089 管理后台）同步写入时的 updated_by 占位：全零 UUID 表示非人工操作。 */
export const LAYOUT_SYNC_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
const LAYOUT_TEXT_LIMIT = 2 * 1024 * 1024;

type HomeLayoutProject = { html?: unknown; css?: unknown };

/** 官网首页渲染只认这个结构：html/css 是装修系统产出的静态版式，不含任何后台字段。 */
export interface PublicHomeLayout {
  html: string;
  css: string;
  version: number;
  updatedAt: string;
}

export class HomeLayoutService {
  constructor(private readonly db: DatabasePort) {}

  /** 公开读取：没有同步过版式时返回 null，官网首页据此回退到内置设计。 */
  async readPublished(): Promise<PublicHomeLayout | null> {
    const result = await this.db.query<{ project: HomeLayoutProject; version: number; updated_at: Date }>(
      "SELECT project, version, updated_at FROM commerce.storefront_layout_drafts WHERE page_key = 'homepage'",
    );
    const row = result.rows[0];
    if (!row) return null;
    const project = row.project ?? {};
    const html = typeof project.html === 'string' ? project.html : '';
    if (!html.trim()) return null;
    return {
      html,
      css: typeof project.css === 'string' ? project.css : '',
      version: row.version,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /** 外部系统同步：整份覆盖 homepage 草稿并把版本号 +1，读取端据此判断是否有新版。 */
  async sync(input: { html: unknown; css: unknown; source?: string }): Promise<{ version: number; updatedAt: string }> {
    const html = typeof input.html === 'string' ? input.html : '';
    if (!html.trim()) throw new CommerceValidationError('Layout HTML is required');
    if (Buffer.byteLength(html, 'utf8') > LAYOUT_TEXT_LIMIT) throw new CommerceValidationError('Layout HTML exceeds the 2 MB limit');
    const css = typeof input.css === 'string' ? input.css : '';
    if (Buffer.byteLength(css, 'utf8') > LAYOUT_TEXT_LIMIT) throw new CommerceValidationError('Layout CSS exceeds the 2 MB limit');
    const project = JSON.stringify({
      html,
      css,
      source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'alsvid-8089',
      syncedAt: new Date().toISOString(),
    });
    const result = await this.db.query<{ version: number; updated_at: Date }>(
      `INSERT INTO commerce.storefront_layout_drafts (page_key, project, updated_by) VALUES ('homepage', $1::jsonb, $2)
       ON CONFLICT (page_key) DO UPDATE SET project = EXCLUDED.project, updated_by = EXCLUDED.updated_by,
         updated_at = now(), version = storefront_layout_drafts.version + 1
       RETURNING version, updated_at`,
      [project, LAYOUT_SYNC_ACTOR_ID],
    );
    const row = result.rows[0]!;
    return { version: row.version, updatedAt: new Date(row.updated_at).toISOString() };
  }
}
