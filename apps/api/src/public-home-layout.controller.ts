import { BadRequestException, Body, Controller, Get, Headers, Put, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from './public.decorator.js';
import { PublicRateLimit } from './platform/public-rate-limit.decorator.js';
import { homeLayoutService } from './runtime.js';

/**
 * 官网首页装修版式的公开通道。
 *
 * 读取：`GET /v1/public/home-layout` 给 www 首页做服务端渲染用，匿名可访问；
 * 没有同步过版式时返回 `{ data: null }`，首页据此回退到内置设计。
 *
 * 写入：`PUT /v1/public/home-layout` 只接受持有 ALSVID_LAYOUT_SYNC_TOKEN 的装修系统
 * （ALSVID 8089 管理后台）。未配置该环境变量时写入直接关闭，读取不受影响。
 */
const SYNC_TOKEN_HEADER = 'x-alsvid-sync-token';
const MAX_LAYOUT_BYTES = 2 * 1024 * 1024;

function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual 要求等长，长度不同直接判否（长度本身不是秘密）
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('v1/public/home-layout')
export class PublicHomeLayoutController {
  @Public()
  // 官网首页是最高频的公开页面，读取给足配额；写入单独收紧。
  @PublicRateLimit({ perClient: 600, windowMs: 60 * 1000 })
  @Get()
  async read() {
    const data = await homeLayoutService.readPublished();
    return { data };
  }

  @Public()
  @PublicRateLimit({ perClient: 30, windowMs: 60 * 1000 })
  @Put()
  async sync(@Headers(SYNC_TOKEN_HEADER) token: string | undefined, @Body() body: unknown) {
    const expected = process.env.ALSVID_LAYOUT_SYNC_TOKEN?.trim();
    if (!expected) throw new ServiceUnavailableException('Layout sync is not configured for this environment');
    if (!tokenMatches(token, expected)) throw new UnauthorizedException('Invalid layout sync token');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid layout payload');
    const input = body as { html?: unknown; css?: unknown; source?: unknown };
    if (typeof input.html !== 'string') throw new BadRequestException('Layout HTML must be a string');
    if (Buffer.byteLength(input.html, 'utf8') > MAX_LAYOUT_BYTES) throw new BadRequestException('Layout HTML exceeds the 2 MB limit');
    if (input.css !== undefined && typeof input.css !== 'string') throw new BadRequestException('Layout CSS must be a string');
    // source 只是写入来源标记（审计用），非字符串一律忽略，避免脏数据进库
    const source = typeof input.source === 'string' ? input.source : undefined;
    // exactOptionalPropertyTypes: 只有拿到字符串才带 source 字段
    return { data: await homeLayoutService.sync({ html: input.html, css: input.css ?? '', ...(source ? { source } : {}) }) };
  }
}
