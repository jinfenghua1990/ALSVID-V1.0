import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUniqueRoles, normalizeIdentifier, PartnerValidationError } from './index.js';

test('identifier normalization makes legal identifiers comparable', () => {
  assert.deepEqual(normalizeIdentifier(' eori ', ' de 123 456 '), {
    scheme: 'EORI',
    rawValue: 'de 123 456',
    normalizedValue: 'DE123456',
  });
  assert.equal(normalizeIdentifier('email', ' SALES@Example.COM ').normalizedValue, 'sales@example.com');
});

test('a Partner cannot receive the same role twice', () => {
  assert.doesNotThrow(() => assertUniqueRoles(['DEALER', 'SERVICE_PARTNER']));
  assert.throws(() => assertUniqueRoles(['DEALER', 'DEALER']), PartnerValidationError);
});

test('supplier factory links require SUPPLIER and FACTORY roles and reject self links', async () => {
  const { PartnerService } = await import('./application/partner-service.js');
  const { PartnerValidationError: ValidationError, PartnerCapability } = await import('./index.js');
  const roles = new Map<string, string[]>([
    ['supplier-1', ['SUPPLIER']],
    ['factory-1', ['FACTORY']],
    ['factory-2', ['FACTORY']],
    ['dealer-1', ['DEALER']],
  ]);
  const links: string[] = [];
  const audit: string[] = [];
  const repository: any = {
    transaction: async (work: any) => work({ query: async () => ({ rows: [] }) }),
    get: async (id: string) => (roles.has(id) ? { id } : null),
    partnerHasRole: async (id: string, role: string) => (roles.get(id) ?? []).includes(role),
    listFactories: async () => links.map(id => ({ id, factoryId: id, factoryCode: id, displayName: id, countryCode: null, status: 'ACTIVE' })),
    replaceFactories: async (_supplier: string, _actor: string, ids: string[]) => { links.length = 0; links.push(...ids); },
  };
  const service = new PartnerService(repository, { record: async (input: any) => { audit.push(input.action); } });
  const actor = { userId: 'u1', permissions: [PartnerCapability.Read, PartnerCapability.Write] };

  await assert.rejects(() => service.replaceFactories(actor, 'dealer-1', ['factory-1']), ValidationError);
  await assert.rejects(() => service.replaceFactories(actor, 'supplier-1', ['dealer-1']), ValidationError);
  await assert.rejects(() => service.replaceFactories(actor, 'supplier-1', ['supplier-1']), ValidationError);

  const saved = await service.replaceFactories(actor, 'supplier-1', ['factory-1', 'factory-2', 'factory-1']);
  assert.deepEqual(saved.map(link => link.factoryId), ['factory-1', 'factory-2']);
  assert.deepEqual(audit, ['partner.factories_replaced']);
});
