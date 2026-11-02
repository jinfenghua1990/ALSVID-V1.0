import type { DatabasePort } from '@alsvid/database';
import { IntegrationService, type IntegrationAuditPort } from '../application/index.js';
import { PostgresIntegrationRepository } from './postgres-integration-repository.js';
export { PostgresIntegrationRepository } from './postgres-integration-repository.js';
// Warehouse mappings + read-only historical event evidence only.
// Do not inject external-commerce ingestion adapters into the production runtime.
export function createIntegrationService(database: DatabasePort, audit: IntegrationAuditPort): IntegrationService {
  return new IntegrationService(new PostgresIntegrationRepository(database), audit);
}
