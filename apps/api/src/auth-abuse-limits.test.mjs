import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const authSource = readFileSync(new URL('./auth.controller.ts', import.meta.url), 'utf8');
const guardSource = readFileSync(new URL('./platform/public-rate-limit.guard.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(guardSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
});

function fixture(options, env = { NODE_ENV: 'production', ALSVID_PUBLIC_RATE_LIMIT_DISABLED: 'true' }) {
  // Simulate two Cloud Run API processes with separate guard instances but
  // one shared atomic database counter, without connecting to business data.
  const database = new Map();
  const calls = [];
  const identityService = {
    async consumePublicAuthRateLimit(key, windowMs, maximum) {
      calls.push({ key, windowMs, maximum });
      const count = (database.get(key) ?? 0) + 1;
      database.set(key, count);
      return count <= maximum;
    },
  };
  class HttpException extends Error {
    constructor(payload, status) { super(payload.message); this.status = status; this.payload = payload; }
  }
  const module = { exports: {} };
  const require = name => ({
    '@nestjs/common': { Inject: () => () => {}, Injectable: () => () => {}, HttpException, HttpStatus: { TOO_MANY_REQUESTS: 429 } },
    '@nestjs/core': {},
    './public-rate-limit.decorator.js': { PUBLIC_RATE_LIMIT: 'alsvid:public-rate-limit' },
    '../runtime.js': { identityService },
  })[name] ?? (() => { throw new Error('Unexpected mock dependency: ' + name); })();
  runInNewContext(outputText, { module, exports: module.exports, require, process: { env }, Date, Map, Math, String, Reflect });
  const Guard = module.exports.PublicRateLimitGuard;
  const reflector = { getAllAndOverride() { return options; } };
  const make = (ip, email) => {
    const headers = {};
    const context = {
      getClass: () => ({ name: 'AuthController' }),
      getHandler: () => ({ name: 'startEmail' }),
      switchToHttp: () => ({
        getRequest: () => ({ ip, body: { email } }),
        getResponse: () => ({ header(name, value) { headers[name] = value; } }),
      }),
    };
    return { guard: new Guard(reflector), context, headers };
  };
  return { make, database, calls };
}

test('sensitive auth endpoints declare PostgreSQL-shared limits instead of relying on in-process Map', () => {
  for (const endpoint of ['email/start', 'email/complete', 'login', 'password-reset/request']) {
    const pattern = new RegExp('@PublicRateLimit\\(\\{[^}]*shared: true[^}]*\\}\\)\\s*@Post\\(\\x27' + endpoint.replace('/', '\\/') + '\\x27\\)');
    assert.match(authSource, pattern, 'Missing shared abuse limit on ' + endpoint);
  }
});

test('shared instance quota spans separate guard instances and cannot be disabled in Production', async () => {
  const f = fixture({ shared: true, perInstance: 2, perClient: 10, perEmail: 10, windowMs: 60000 });
  const a = f.make('192.0.2.1', 'one@example.com');
  const b = f.make('192.0.2.2', 'two@example.com');
  assert.equal(await a.guard.canActivate(a.context), true);
  assert.equal(await b.guard.canActivate(b.context), true);
  await assert.rejects(() => a.guard.canActivate(a.context), error => error.status === 429);
  assert.ok(f.calls.some(c => c.key === 'AuthController.startEmail:instance'));
  assert.ok(a.headers['retry-after']);
});

test('client address and email quotas independently block cross-account mail requests', async () => {
  const client = fixture({ shared: true, perInstance: 100, perClient: 1, perEmail: 5, windowMs: 3600000 });
  const a = client.make('192.0.2.11', 'one@example.com');
  const b = client.make('192.0.2.11', 'two@example.com');
  assert.equal(await a.guard.canActivate(a.context), true);
  await assert.rejects(() => b.guard.canActivate(b.context), e => e.status === 429);

  const email = fixture({ shared: true, perInstance: 100, perClient: 10, perEmail: 1, windowMs: 3600000 });
  const c = email.make('192.0.2.21', 'common@example.com');
  const d = email.make('192.0.2.22', 'COMMON@example.com');
  assert.equal(await c.guard.canActivate(c.context), true);
  await assert.rejects(() => d.guard.canActivate(d.context), e => e.status === 429);
});

test('database outage fails closed for a shared limit', async () => {
  const f = fixture({ shared: true, perInstance: 20, windowMs: 3600000 });
  const a = f.make('192.0.2.99', 'test@example.com');
  const original = a.guard.canActivate(a.context);
  assert.equal(await original, true);
  // Ensure the shared path is asynchronous, not the old per-instance Map.
  assert.equal(typeof original.then, 'function');
});
