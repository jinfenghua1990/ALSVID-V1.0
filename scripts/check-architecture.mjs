import './check-identifier-standard.mjs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const domainsRoot = join(root, 'domains');
const errors = [];
const warnings = [];
const providerPrefixes = ['@aws-sdk/', '@shopify/', 'shopify', 'openai', '@openai/', 'resend', '@sendgrid/', 'mailgun', 'stripe'];

function walk(directory) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  const specs = [];
  const pattern = /(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) specs.push(match[1]);
  return specs;
}

function relativePath(path) {
  return relative(root, path).split(sep).join('/');
}

const domainNames = readdirSync(domainsRoot).filter((name) => {
  const path = join(domainsRoot, name);
  return statSync(path).isDirectory();
});
const domainSet = new Set(domainNames);
const manifests = new Map();

for (const name of domainNames) {
  const domainRoot = join(domainsRoot, name);
  const manifestPath = join(domainRoot, 'domain.json');
  const packagePath = join(domainRoot, 'package.json');
  if (!existsSync(manifestPath)) {
    errors.push(`domains/${name}: missing domain.json`);
    continue;
  }
  if (!existsSync(packagePath)) {
    errors.push(`domains/${name}: missing package.json`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  manifests.set(name, manifest);
  if (manifest.name !== name) errors.push(`domains/${name}: manifest name must be ${name}`);
  if (!['legacy', 'encapsulated'].includes(manifest.mode)) errors.push(`domains/${name}: mode must be legacy or encapsulated`);
  if (pkg.name !== `@alsvid/${name}`) errors.push(`domains/${name}: package name must be @alsvid/${name}`);
  if (pkg.exports?.['.'] !== './src/index.ts') errors.push(`domains/${name}: only public facade must be exported from ./src/index.ts`);

  const sourceFiles = walk(join(domainRoot, 'src')).filter((path) => ['.ts', '.tsx'].includes(extname(path)));
  for (const file of sourceFiles) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('@alsvid/')) continue;
      const [, target, ...subpath] = spec.split('/');
      if (target && domainSet.has(target) && subpath.length > 0) errors.push(`${relativePath(file)}: imports internal path ${spec}`);
      if (manifest.mode === 'encapsulated' && target && domainSet.has(target) && target !== name && !(manifest.dependsOn ?? []).includes(target)) {
        errors.push(`${relativePath(file)}: cross-domain import ${spec} is not declared in domain.json`);
      }
    }
  }

  if (manifest.mode === 'encapsulated') {
    for (const layer of ['core', 'application', 'infrastructure', 'api']) {
      const layerFiles = walk(join(domainRoot, 'src', layer)).filter((path) => ['.ts', '.tsx'].includes(extname(path)));
      if (layerFiles.length === 0) errors.push(`domains/${name}: encapsulated domain requires src/${layer}`);
    }
    const facadePath = join(domainRoot, 'src', 'index.ts');
    if (!existsSync(facadePath)) errors.push(`domains/${name}: missing src/index.ts facade`);
    else if (readFileSync(facadePath, 'utf8').split('\n').length > 80) errors.push(`domains/${name}: src/index.ts must be facade-only (max 80 lines)`);

    for (const layer of ['core', 'application']) {
      for (const file of walk(join(domainRoot, 'src', layer)).filter((path) => ['.ts', '.tsx'].includes(extname(path)))) {
        for (const spec of importsOf(file)) {
          if (providerPrefixes.some((prefix) => spec === prefix || spec.startsWith(prefix))) {
            errors.push(`${relativePath(file)}: provider SDK ${spec} is forbidden in ${layer}`);
          }
        }
      }
    }
  } else {
    warnings.push(`domains/${name}: legacy implementation still requires encapsulation`);
  }
}

for (const area of ['apps', 'packages']) {
  for (const file of walk(join(root, area)).filter((path) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)))) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('@alsvid/')) continue;
      const [, target, ...subpath] = spec.split('/');
      if (target && domainSet.has(target) && subpath.length > 0) errors.push(`${relativePath(file)}: application/platform code imports domain internal path ${spec}`);
    }
  }
}

if (warnings.length) {
  console.log('Architecture migration status:');
  for (const warning of warnings) console.log(`  WARN ${warning}`);
}
if (errors.length) {
  console.error('Architecture violations:');
  for (const error of errors) console.error(`  ERROR ${error}`);
  process.exit(1);
}
console.log(`Architecture check passed for ${domainNames.length} domains.`);
