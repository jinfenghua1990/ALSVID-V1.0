import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { Public } from './public.decorator.js';
import { PublicRateLimit } from './platform/public-rate-limit.decorator.js';
import { database } from './runtime.js';

type ColourPreferenceInput = {
  productCode?: unknown;
  sessionKey?: unknown;
  modelCode?: unknown;
  colourCode?: unknown;
  locale?: unknown;
};

const MODELS = ['standard', 'pro'] as const;
const COLOURS = ['sample', 'black', 'blue', 'silver'] as const;
const LOCALES = ['zh', 'de', 'en'] as const;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowed(value: unknown, options: readonly string[]): value is string {
  return typeof value === 'string' && options.includes(value);
}

@Controller('v1/colour-interest')
export class ColourInterestController {
  /** Public, deliberately small and pseudonymous: no email, names, IP or purchase records. */
  @Public()
  @PublicRateLimit({ perClient: 120, windowMs: 60 * 60 * 1000 })
  @Post()
  async select(@Body() input: ColourPreferenceInput) {
    if (
      input?.productCode !== 'A1-ULTRA'
      || typeof input.sessionKey !== 'string'
      || !UUID_V4.test(input.sessionKey)
      || !allowed(input.modelCode, MODELS)
      || !allowed(input.colourCode, COLOURS)
      || !allowed(input.locale, LOCALES)
    ) throw new BadRequestException('Invalid product preference');

    await database.query(
      `INSERT INTO marketing.product_colour_preferences
        (product_code, session_key, model_code, colour_code, locale)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (product_code, session_key) DO UPDATE
      SET model_code = EXCLUDED.model_code,
          colour_code = EXCLUDED.colour_code,
          locale = EXCLUDED.locale,
          updated_at = now()`,
      [input.productCode, input.sessionKey, input.modelCode, input.colourCode, input.locale],
    );
    return { data: { saved: true } };
  }

  /** Readable by ALSVID Admin only, never available through the public storefront. */
  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest) {
    const actor = requireAuth(request);
    if (!actor.roles.includes('system_admin')) {
      throw new ForbiddenException('Admin access required');
    }
    const [colours, models, total] = await Promise.all([
      database.query<{ colour_code: string; selections: number }>(
        `SELECT colour_code, COUNT(*)::integer AS selections
         FROM marketing.product_colour_preferences
         WHERE product_code = 'A1-ULTRA' GROUP BY colour_code ORDER BY selections DESC, colour_code`,
      ),
      database.query<{ model_code: string; colour_code: string; selections: number }>(
        `SELECT model_code, colour_code, COUNT(*)::integer AS selections
         FROM marketing.product_colour_preferences
         WHERE product_code = 'A1-ULTRA' GROUP BY model_code, colour_code
         ORDER BY selections DESC, model_code, colour_code`,
      ),
      database.query<{ total: number; last_selection: string | null }>(
        `SELECT COUNT(*)::integer AS total, MAX(updated_at)::text AS last_selection
         FROM marketing.product_colour_preferences WHERE product_code = 'A1-ULTRA'`,
      ),
    ]);
    return {
      data: {
        productCode: 'A1-ULTRA',
        total: total.rows[0]?.total ?? 0,
        lastSelection: total.rows[0]?.last_selection ?? null,
        colours: colours.rows.map(row => ({ code: row.colour_code, count: row.selections })),
        variants: models.rows.map(row => ({
          model: row.model_code,
          colour: row.colour_code,
          count: row.selections,
        })),
        note: 'One latest selection per browser session. These are preferences, not paid orders or verified unique customers.',
      },
    };
  }
}
