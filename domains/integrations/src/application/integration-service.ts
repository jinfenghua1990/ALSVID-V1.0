import { postgresErrorCode } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import { IntegrationCapability, type CreateExternalSkuMappingInput, type CreateExternalWarehouseMappingInput, type CreateWarehouseProviderConnectionInput } from '../core/model.js';
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  IntegrationValidationError,
} from '../core/errors.js';
import {
  integrationRequired,
  integrationText,
  integrationTimestamp,
} from '../core/values.js';
import type {
  IntegrationActor,
  IntegrationAuditPort,
  IntegrationRepository,
} from './ports.js';

export class IntegrationService {
  constructor(
    private readonly repository: IntegrationRepository,
    private readonly audit: IntegrationAuditPort,
  ) {}

  async summary(actor: IntegrationActor): Promise<any> {
    requirePermission(actor, 'commerce.read');
    return this.repository.summary();
  }

  async warehouseProviderSummary(actor: IntegrationActor): Promise<any> {
    requirePermission(actor, IntegrationCapability.Admin);
    return this.repository.warehouseProviderSummary();
  }

  async createWarehouseProviderConnection(
    actor: IntegrationActor,
    input: CreateWarehouseProviderConnectionInput,
  ): Promise<any> {
    requirePermission(actor, IntegrationCapability.Admin);
    const providerCode = integrationRequired(input.providerCode, 'providerCode').toUpperCase();
    const displayName = integrationRequired(input.displayName, 'displayName');
    const accountRef = integrationRequired(input.accountRef, 'accountRef');
    const credentialsSecretRef = integrationText(input.credentialsSecretRef) ?? undefined;

    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(providerCode)) {
      throw new IntegrationValidationError('providerCode must be 2-64 uppercase letters, numbers, dots, underscores or hyphens');
    }
    if (displayName.length < 2 || displayName.length > 120) {
      throw new IntegrationValidationError('displayName must be between 2 and 120 characters');
    }
    if (accountRef.length > 255) {
      throw new IntegrationValidationError('accountRef must be at most 255 characters');
    }
    if (credentialsSecretRef && !/^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/secrets\/alsvid-wms-[A-Za-z0-9_-]{1,240}\/versions\/(latest|[1-9][0-9]*)$/.test(credentialsSecretRef)) {
      throw new IntegrationValidationError('credentialsSecretRef must be a Google Secret Manager resource path, not a secret value');
    }

    const connectionStatus = credentialsSecretRef ? 'PENDING_REVIEW' : 'NOT_CONFIGURED';
    try {
      const row = await this.repository.createWarehouseProviderConnection({
        providerCode,
        displayName,
        accountRef,
        ...(credentialsSecretRef ? { credentialsSecretRef } : {}),
        connectionStatus,
        actorUserId: actor.userId,
      });
      await this.audit.record({
        actorUserId: actor.userId,
        action: 'integration.warehouse_provider_created',
        targetType: 'integration.warehouse_provider_connection',
        targetId: row.id,
        metadata: { providerCode, accountRef, connectionStatus, credentialsConfigured: Boolean(credentialsSecretRef) },
      });
      return row;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createExternalWarehouseMapping(
    actor: IntegrationActor,
    connectionId: string,
    input: CreateExternalWarehouseMappingInput,
  ): Promise<any> {
    requirePermission(actor, IntegrationCapability.Admin);
    const normalized = {
      connectionId: integrationRequired(connectionId, 'connectionId'),
      internalWarehouseId: integrationRequired(input.internalWarehouseId, 'internalWarehouseId'),
      externalWarehouseId: integrationRequired(input.externalWarehouseId, 'externalWarehouseId'),
      externalCode: integrationRequired(input.externalCode, 'externalCode'),
      externalName: integrationRequired(input.externalName, 'externalName'),
    };
    if (normalized.externalWarehouseId.length > 255) throw new IntegrationValidationError('externalWarehouseId must be at most 255 characters');
    if (normalized.externalCode.length > 120) throw new IntegrationValidationError('externalCode must be at most 120 characters');
    if (normalized.externalName.length > 255) throw new IntegrationValidationError('externalName must be at most 255 characters');
    try {
      const row = await this.repository.createExternalWarehouseMapping({ ...normalized, actorUserId: actor.userId });
      await this.audit.record({
        actorUserId: actor.userId,
        action: 'integration.external_warehouse_mapping_created',
        targetType: 'integration.external_warehouse_mapping',
        targetId: row.id,
        metadata: { connectionId: normalized.connectionId, internalWarehouseId: normalized.internalWarehouseId, externalWarehouseId: normalized.externalWarehouseId },
      });
      return row;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createExternalSkuMapping(
    actor: IntegrationActor,
    connectionId: string,
    input: CreateExternalSkuMappingInput,
  ): Promise<any> {
    requirePermission(actor, IntegrationCapability.Admin);
    const normalized = {
      connectionId: integrationRequired(connectionId, 'connectionId'),
      internalSkuId: integrationRequired(input.internalSkuId, 'internalSkuId'),
      externalSku: integrationRequired(input.externalSku, 'externalSku'),
      externalItemId: integrationRequired(input.externalItemId, 'externalItemId'),
    };
    if (normalized.externalSku.length > 255) throw new IntegrationValidationError('externalSku must be at most 255 characters');
    if (normalized.externalItemId.length > 255) throw new IntegrationValidationError('externalItemId must be at most 255 characters');
    try {
      const row = await this.repository.createExternalSkuMapping({ ...normalized, actorUserId: actor.userId });
      await this.audit.record({
        actorUserId: actor.userId,
        action: 'integration.external_sku_mapping_created',
        targetType: 'integration.external_sku_mapping',
        targetId: row.id,
        metadata: { connectionId: normalized.connectionId, internalSkuId: normalized.internalSkuId, externalSku: normalized.externalSku, externalItemId: normalized.externalItemId },
      });
      return row;
    } catch (error) {
      this.rethrow(error);
    }
  }

  async setCursor(
    actor: IntegrationActor,
    channelId: string,
    input: { cursorKey: string; cursorValue: string; sourceUpdatedAt?: string },
  ): Promise<any> {
    requirePermission(actor, IntegrationCapability.Admin);
    const row = await this.repository.setCursor({
      channelId,
      cursorKey: integrationRequired(input.cursorKey, 'cursorKey'),
      cursorValue: integrationRequired(input.cursorValue, 'cursorValue'),
      sourceUpdatedAt: integrationTimestamp(input.sourceUpdatedAt) ?? null,
      actorUserId: actor.userId,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'integration.cursor_updated',
      targetType: 'integration.cursor',
      targetId: row.id,
      metadata: { channelId, cursorKey: input.cursorKey },
    });
    return row;
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof IntegrationValidationError ||
      error instanceof IntegrationNotFoundError ||
      error instanceof IntegrationConflictError
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : '';
    const code = postgresErrorCode(error);
    if (code === '23503') throw new IntegrationNotFoundError('Referenced integration channel, provider connection, warehouse or SKU was not found');
    if (code === '23505') throw new IntegrationConflictError(message);
    if (code === '23514') throw new IntegrationValidationError(message);
    throw error;
  }
}

function requirePermission(actor: IntegrationActor, permission: string): void {
  if (!actor.permissions.includes(permission)) {
    throw new ForbiddenError('INTEGRATION_FORBIDDEN', `Missing permission: ${permission}`);
  }
}
