import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_RATE_LIMIT, type PublicRateLimitOptions } from './public-rate-limit.decorator.js';
import { identityService } from '../runtime.js';

interface Window {
  count: number;
  resetAt: number;
}

interface LimitedRequest {
  ip?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface LimitedResponse {
  header?: (name: string, value: string) => unknown;
}

const SWEEP_THRESHOLD = 10_000;

function bodyEmail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).email;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().slice(0, 254);
  return normalized || null;
}

function clientAddress(request: LimitedRequest): string {
  if (request.ip?.trim()) return request.ip.trim();
  // Fallback only: the nearest proxy's entry (the rightmost one) is appended by
  // infrastructure, while the leftmost entry is whatever the caller sent.
  const forwarded = request.headers?.['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const entries = value?.split(',') ?? [];
  return entries[entries.length - 1]?.trim() || 'unknown';
}

/**
 * Fixed-window limiter for public, unauthenticated writes. It is transport-level
 * abuse control, not a business rule. Sensitive authentication routes use the
 * existing PostgreSQL-backed atomic counter across instances; other marked
 * routes may use the in-process limiter. Configure the API with a
 * trusted proxy so `request.ip` is the caller and not the gateway.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PublicRateLimitOptions | undefined>(PUBLIC_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;
    // Never allow an environment flag to silently bypass authentication abuse limits in Production.
    if (process.env.ALSVID_PUBLIC_RATE_LIMIT_DISABLED === 'true' && process.env.NODE_ENV !== 'production') return true;

    const request = context.switchToHttp().getRequest<LimitedRequest>();
    const scope = `${context.getClass().name}.${context.getHandler().name}`;
    const buckets: Array<[string, number]> = [];
    if (options.perInstance) buckets.push(['instance', options.perInstance]);
    if (options.perClient) buckets.push([`client:${clientAddress(request)}`, options.perClient]);
    const email = bodyEmail(request.body);
    if (options.perEmail && email) buckets.push([`email:${email}`, options.perEmail]);
    if (options.shared) return this.enforceShared(context, scope, buckets, options.windowMs);

    this.sweep();
    const now = Date.now();
    for (const [target, limit] of buckets) {
      const key = `${scope}:${target}`;
      const window = this.windows.get(key);
      if (!window || window.resetAt <= now) {
        this.windows.set(key, { count: 1, resetAt: now + options.windowMs });
        continue;
      }
      if (window.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
        context.switchToHttp().getResponse<LimitedResponse>()?.header?.('retry-after', String(retryAfter));
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests. Please retry later.', retryAfter },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      window.count += 1;
    }
    return true;
  }

  private async enforceShared(context: ExecutionContext, scope: string, buckets: Array<[string, number]>, windowMs: number): Promise<boolean> {
    // Existing identity.auth_rate_limits uses atomic INSERT ... ON CONFLICT,
    // so scaling Cloud Run does not multiply the allowed quota. Fail closed
    // when the shared database cannot be reached; never send auth emails first.
    for (const [target, limit] of buckets) {
      const allowed = await identityService.consumePublicAuthRateLimit(`${scope}:${target}`, windowMs, limit);
      if (!allowed) {
        const retryAfter = Math.max(1, Math.ceil(windowMs / 1000));
        context.switchToHttp().getResponse<LimitedResponse>()?.header?.('retry-after', String(retryAfter));
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests. Please retry later.', retryAfter },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  private sweep(): void {
    if (this.windows.size < SWEEP_THRESHOLD) return;
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
