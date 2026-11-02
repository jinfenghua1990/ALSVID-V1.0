import { SetMetadata } from '@nestjs/common';

export const PUBLIC_RATE_LIMIT = 'alsvid:public-rate-limit';

export interface PublicRateLimitOptions {
  /** Burst allowed from one client address inside the window. */
  perClient?: number;
  /** Second bucket keyed by the normalized `email` in the request body. */
  perEmail?: number;
  /** Instance-wide ceiling so one abuser cannot drain the mail quota. */
  perInstance?: number;
  windowMs: number;
  /** Enforce every bucket atomically in shared PostgreSQL across all API instances. */
  shared?: boolean;
}

/** Marks a public route that needs abuse protection; the guard ignores unmarked routes. */
export const PublicRateLimit = (options: PublicRateLimitOptions) => SetMetadata(PUBLIC_RATE_LIMIT, options);
