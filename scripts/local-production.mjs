#!/usr/bin/env node
// Authorized local Production: same Neon/R2/identity as Cloud Run; no migrations or workers.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configFile = join(root, 'infra/.env.local');
const project = 'alsvid-local-production';
const composeFile = 'infra/docker-compose.local-production.yml';
const action = process.argv[2] ?? 'up';

function command(bin, args) {
  // Windows installs gcloud as a gcloud.cmd shim, and Node refuses to spawn .cmd without a shell
  // (CVE-2024-27980), so run it through cmd.exe instead of resolving the bare name ourselves.
  const windows = process.platform === 'win32';
  const executable = windows ? process.env.ComSpec || 'cmd.exe' : bin;
  const argv = windows ? ['/d', '/s', '/c', bin, ...args] : args;
  try {
    return execFileSync(executable, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error('Required command failed: ' + bin + ' (check installation, login and access permissions)');
  }
}
function config() {
  if (!existsSync(configFile)) throw new Error('Copy infra/local-production.env.example to infra/.env.local and fill non-secret settings');
  const allowed = new Set(['GCP_PROJECT_ID', 'GCP_REGION', 'OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET',
    'MAIL_FROM_ADDRESS', 'NEXT_PUBLIC_FC1_RESERVATION_EMAIL', 'ALSVID_INTERNAL_EMAIL_DOMAINS',
    'ALSVID_INTERNAL_REGISTRATION_MODE', 'ALSVID_INITIAL_ADMIN_EMAIL']);
  const env = {};
  for (const raw of readFileSync(configFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const pair = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!pair || !allowed.has(pair[1])) throw new Error('infra/.env.local accepts non-secret template keys only');
    env[pair[1]] = pair[2].trim();
  }
  for (const key of ['GCP_PROJECT_ID', 'GCP_REGION', 'OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET']) {
    if (!env[key] || env[key].includes('<') || env[key].includes('__'))
      throw new Error('Set verified Production value for ' + key + ' in infra/.env.local');
  }
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(env.GCP_PROJECT_ID)) throw new Error('Invalid GCP_PROJECT_ID');
  if (!/^[a-z]+-[a-z]+\d+$/.test(env.GCP_REGION)) throw new Error('Invalid GCP_REGION');
  const endpoint = new URL(env.OBJECT_STORAGE_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname))
    throw new Error('R2 endpoint must be HTTPS Cloudflare R2');
  return env;
}
function secret(projectId, name) {
  const v = command('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', projectId]);
  if (!v) throw new Error('Empty Secret Manager entry: ' + name);
  return v;
}
function verifyBindings(env, databaseUrl) {
  // Mirrors packages/database's approved production target check.
  const url = new URL(databaseUrl);
  const host = 'ep-shy-truth-b9laycln-pooler.c-7.eu-central-1.aws.neon.tech';
  const override = ['host', 'hostaddr', 'port', 'dbname'].some(k => url.searchParams.has(k));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== host || (url.port && url.port !== '5432')
    || url.pathname !== '/ALSVID%20Production' || override
    || !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode')))
    throw new Error('Database secret is not the TLS-enabled ALSVID Production Neon target');

  // Check existing Cloud Run service and its actual non-secret R2 configuration.
  let service;
  try {
    service = JSON.parse(command('gcloud', ['run', 'services', 'describe', 'alsvid-api',
      '--project', env.GCP_PROJECT_ID, '--region', env.GCP_REGION, '--format=json']));
  } catch { throw new Error('Cannot verify active Cloud Run alsvid-api; refusing ambiguous Production bindings'); }
  const entries = service?.spec?.template?.spec?.containers?.[0]?.env ?? service?.template?.containers?.[0]?.env;
  if (!Array.isArray(entries)) throw new Error('Cannot inspect Cloud Run Production environment');
  const value = key => entries.find(e => e.name === key)?.value;
  if (value('OBJECT_STORAGE_ENDPOINT') !== env.OBJECT_STORAGE_ENDPOINT
    || value('OBJECT_STORAGE_BUCKET') !== env.OBJECT_STORAGE_BUCKET)
    throw new Error('Configured R2 endpoint/bucket differs from active Cloud Run');
  const meta = JSON.stringify(entries);
  for (const name of ['alsvid-database-url', 'alsvid-r2-access-key', 'alsvid-r2-secret-key']) {
    if (!meta.includes(name)) throw new Error('Cloud Run missing expected secret reference: ' + name);
  }
}
function compose(args, env) {
  const result = spawnSync('docker', ['compose', '-p', project, '-f', composeFile, ...args],
    { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  if (!['up', 'down', 'status'].includes(action)) throw new Error('Usage: node scripts/local-production.mjs [up|down|status]');
  if (action === 'status') {
    const result = spawnSync('docker', ['ps', '--filter', 'label=com.docker.compose.project=' + project],
      { cwd: root, stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
  if (action === 'down') {
    // Compose needs interpolation values when stopping, but no live service gets them.
    compose(['down'], { ...process.env, ALSVID_RELEASE_SHA: 'unused-for-down',
      DATABASE_URL: 'unused-for-down', OBJECT_STORAGE_ENDPOINT: 'https://unused.r2.cloudflarestorage.com',
      OBJECT_STORAGE_BUCKET: 'unused-for-down', OBJECT_STORAGE_ACCESS_KEY: 'unused-for-down',
      OBJECT_STORAGE_SECRET_KEY: 'unused-for-down', MAIL_API_KEY: 'unused-for-down' });
    process.exit(0);
  }
  if (command('git', ['branch', '--show-current']) !== 'main'
    || command('git', ['status', '--porcelain', '--untracked-files=normal']) !== '')
    throw new Error('Local Production requires a clean main checkout (including no untracked source files), not a draft or uncommitted business code');
  const sha = command('git', ['rev-parse', 'HEAD']);
  const env = config();
  const secured = {
    DATABASE_URL: secret(env.GCP_PROJECT_ID, 'alsvid-database-url'),
    OBJECT_STORAGE_ACCESS_KEY: secret(env.GCP_PROJECT_ID, 'alsvid-r2-access-key'),
    OBJECT_STORAGE_SECRET_KEY: secret(env.GCP_PROJECT_ID, 'alsvid-r2-secret-key'),
    MAIL_API_KEY: secret(env.GCP_PROJECT_ID, 'alsvidbike-mail-api-key'),
  };
  verifyBindings(env, secured.DATABASE_URL);
  console.log('Production bindings verified. Starting only local Web/API/Gateway; no migration, DB container, or worker.');
  compose(['up', '-d', '--build', '--wait'], { ...process.env, ...env, ...secured, ALSVID_RELEASE_SHA: sha });
  console.log('Local: http://127.0.0.1:8080 (loopback only); shared Production Neon/R2 data');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
