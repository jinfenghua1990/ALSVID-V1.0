/**
 * 官网首页装修版式。
 *
 * 版式由 ALSVID 管理后台（8089）可视化装修后同步到 API，这里只做「取回来 + 严格校验」：
 * 任何一步不满足（没配置、超时、结构不对、含脚本）都返回 null，首页回退到内置设计，
 * 保证装修系统异常不会让官网首页打不开。
 */
export type PublicHomeLayout = { html: string; css: string; version: number };

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_CSS_BYTES = 2 * 1024 * 1024;
// 装修产物只应是静态结构与样式；出现脚本或内联事件一律拒绝。
const UNSAFE_MARKUP = /<script\b|<\/script>|\son[a-z]+\s*=|javascript:/i;

export async function homepageLayout(): Promise<PublicHomeLayout | null> {
  const base = process.env.ALSVID_API_BASE_URL;
  if (!base) return null;
  try {
    const response = await fetch(base + '/v1/public/home-layout', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('data' in payload)) return null;
    const data = (payload as { data: unknown }).data;
    if (!data || typeof data !== 'object') return null;
    const item = data as Record<string, unknown>;
    if (typeof item.html !== 'string' || !item.html.trim()) return null;
    if (Buffer.byteLength(item.html, 'utf8') > MAX_HTML_BYTES) return null;
    if (UNSAFE_MARKUP.test(item.html)) return null;
    const css = typeof item.css === 'string' ? item.css : '';
    if (Buffer.byteLength(css, 'utf8') > MAX_CSS_BYTES) return null;
    if (UNSAFE_MARKUP.test(css.replace(/url\([^)]*\)/g, ''))) return null;
    return { html: item.html, css, version: typeof item.version === 'number' ? item.version : 0 };
  } catch {
    return null;
  }
}
