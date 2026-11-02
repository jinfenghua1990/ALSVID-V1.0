import { postgresErrorCode } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import {
  FinanceCapability,
  type AddLandedCostComponentInput,
  type AllocateLandedCostInput,
  type AllocatePaymentInput,
  type CreateFinanceDocumentInput,
  type CreateFxRateInput,
  type CreateLandedCostBatchInput,
  type CreateObligationInput,
  type CreatePaymentInput,
} from '../core/model.js';
import { FinanceConflictError, FinanceNotFoundError, FinanceValidationError } from '../core/errors.js';
import { financeCurrency, financeEffectiveAt, financeNonNegative, financePositive, financeRequired, financeSource, financeVersion } from '../core/validation.js';
import type { FinanceActor, FinanceAuditPort, FinanceRepository } from './ports.js';

type PostedFinanceObligation = Record<string, unknown> & { id: string };

export class FinanceService {
  constructor(private readonly repository: FinanceRepository, private readonly audit: FinanceAuditPort) {}

  async summary(actor: FinanceActor): Promise<any> {
    requirePermission(actor, FinanceCapability.Read);
    return this.repository.summary();
  }

  async createDocument(actor: FinanceActor, input: CreateFinanceDocumentInput): Promise<any> {
    requirePermission(actor, FinanceCapability.DocumentWrite);
    if (!input.partnerId) throw new FinanceValidationError('partnerId is required');
    if (!input.issueDate) throw new FinanceValidationError('issueDate is required');
    const source = financeSource(input);
    const currency = financeCurrency(input.currency);
    try {
      return await this.repository.transaction(async (executor) => {
        const document = await this.repository.createDocument({ ...input, currency, sourceType: source.sourceType, sourceId: source.sourceId, actorUserId: actor.userId }, executor);
        let lineNo = 1;
        for (const line of input.lines ?? []) {
          await this.repository.addDocumentLine(document.id, lineNo++, {
            ...line,
            quantity: financePositive(line.quantity ?? 1, 'quantity'),
            unit: line.unit?.trim().toUpperCase() || 'EA',
            unitPrice: financeNonNegative(line.unitPrice ?? 0, 'unitPrice'),
            netAmount: financeNonNegative(line.netAmount, 'netAmount'),
            taxAmount: financeNonNegative(line.taxAmount ?? 0, 'taxAmount'),
          }, executor);
        }
        const updated = await this.repository.refreshDocumentTotals(document.id, executor);
        await this.audit.record({ actorUserId: actor.userId, action: 'finance.document_created', targetType: 'finance.document', targetId: document.id, metadata: { documentType: input.documentType, sourceType: source.sourceType } }, executor);
        return updated;
      });
    } catch (error) { this.rethrow(error); }
  }

  async verifyDocument(actor: FinanceActor, id: string, expectedVersion: number): Promise<any> {
    requirePermission(actor, FinanceCapability.DocumentPost);
    return this.transitionDocument(actor, id, expectedVersion, 'VERIFIED');
  }

  async returnDocumentToDraft(actor: FinanceActor, id: string, expectedVersion: number): Promise<any> {
    requirePermission(actor, FinanceCapability.DocumentPost);
    return this.transitionDocument(actor, id, expectedVersion, 'DRAFT');
  }

  async voidDocument(actor: FinanceActor, id: string, expectedVersion: number, reason: string): Promise<any> {
    requirePermission(actor, FinanceCapability.DocumentPost);
    financeVersion(expectedVersion);
    const text = financeRequired(reason, 'reason');
    try {
      const row = await this.repository.voidDocument(id, expectedVersion, text, actor.userId);
      if (!row) throw new FinanceConflictError('Finance document changed or cannot be voided');
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.document_voided', targetType: 'finance.document', targetId: id, metadata: { reason: text } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async postDocument(actor: FinanceActor, id: string, expectedVersion: number): Promise<{ document: Record<string, unknown>; obligation: PostedFinanceObligation | null }> {
    requirePermission(actor, FinanceCapability.DocumentPost);
    financeVersion(expectedVersion);
    try {
      return await this.repository.transaction(async (executor) => {
        const current = await this.repository.lockDocument(id, executor);
        if (!current) throw new FinanceNotFoundError('Finance document not found');
        if (current.version !== expectedVersion || current.status !== 'VERIFIED') throw new FinanceConflictError('Finance document changed or is not verified');
        const document = await this.repository.postDocument(id, expectedVersion, actor.userId, executor);
        if (!document) throw new FinanceConflictError('Finance document changed while posting');
        let obligation: PostedFinanceObligation | null = null;
        if (current.document_type === 'SUPPLIER_INVOICE' || current.document_type === 'CUSTOMER_INVOICE') {
          obligation = await this.repository.createObligation({
            direction: current.document_type === 'SUPPLIER_INVOICE' ? 'AP' : 'AR',
            partnerId: current.partner_id,
            currency: current.currency,
            amount: current.total_amount,
            ...(current.due_date ? { dueDate: dateOnly(current.due_date) } : {}),
            sourceType: current.source_type,
            sourceId: current.source_id ?? null,
            note: `Created from ${current.document_number}`,
            actorUserId: actor.userId,
            documentId: current.id,
          }, executor);
        }
        await this.audit.record({ actorUserId: actor.userId, action: 'finance.document_posted', targetType: 'finance.document', targetId: id, metadata: { obligationId: obligation?.id ?? null } }, executor);
        return { document, obligation };
      });
    } catch (error) { this.rethrow(error); }
  }

  async createObligation(actor: FinanceActor, input: CreateObligationInput): Promise<any> {
    requirePermission(actor, FinanceCapability.DocumentPost);
    const source = financeSource(input);
    try {
      const row = await this.repository.createObligation({ ...input, currency: financeCurrency(input.currency), amount: financePositive(input.amount, 'amount'), sourceType: source.sourceType, sourceId: source.sourceId, actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.obligation_created', targetType: 'finance.obligation', targetId: row.id, metadata: { direction: input.direction, sourceType: source.sourceType } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async voidObligation(actor: FinanceActor, id: string, reason: string): Promise<any> {
    requirePermission(actor, FinanceCapability.Reconcile);
    try {
      const row = await this.repository.voidObligation(id, financeRequired(reason, 'reason'), actor.userId);
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.obligation_voided', targetType: 'finance.obligation', targetId: id, metadata: { reason } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async createPayment(actor: FinanceActor, input: CreatePaymentInput): Promise<any> {
    requirePermission(actor, FinanceCapability.PaymentWrite);
    try {
      const row = await this.repository.createPayment({ ...input, currency: financeCurrency(input.currency), amount: financePositive(input.amount, 'amount'), idempotencyKey: financeRequired(input.idempotencyKey, 'idempotencyKey'), actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.payment_recorded', targetType: 'finance.payment', targetId: row.id, metadata: { direction: input.direction } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async reversePayment(actor: FinanceActor, id: string, reason: string): Promise<any> {
    requirePermission(actor, FinanceCapability.PaymentWrite);
    try {
      const row = await this.repository.reversePayment(id, financeRequired(reason, 'reason'), actor.userId);
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.payment_reversed', targetType: 'finance.payment', targetId: id, metadata: { reason } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async createFxRate(actor: FinanceActor, input: CreateFxRateInput): Promise<any> {
    requirePermission(actor, FinanceCapability.Allocate);
    try {
      const row = await this.repository.createFxRate({ ...input, baseCurrency: financeCurrency(input.baseCurrency), quoteCurrency: financeCurrency(input.quoteCurrency), rate: financePositive(input.rate, 'rate'), effectiveAt: financeEffectiveAt(input.effectiveAt), source: financeRequired(input.source, 'source'), actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.fx_rate_recorded', targetType: 'finance.fx_rate', targetId: row.id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async allocatePayment(actor: FinanceActor, input: AllocatePaymentInput): Promise<any> {
    requirePermission(actor, FinanceCapability.Allocate);
    try {
      const row = await this.repository.allocatePayment({ ...input, paymentAmount: financePositive(input.paymentAmount, 'paymentAmount'), obligationAmount: financePositive(input.obligationAmount, 'obligationAmount'), actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.payment_allocated', targetType: 'finance.allocation', targetId: row.id, metadata: { paymentId: input.paymentId, obligationId: input.obligationId } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async reverseAllocation(actor: FinanceActor, id: string, reason: string): Promise<any> {
    requirePermission(actor, FinanceCapability.Allocate);
    try {
      const row = await this.repository.reverseAllocation(id, financeRequired(reason, 'reason'), actor.userId);
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.allocation_reversed', targetType: 'finance.allocation', targetId: id, metadata: { reason } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async createLandedCostBatch(actor: FinanceActor, input: CreateLandedCostBatchInput): Promise<any> {
    requirePermission(actor, FinanceCapability.LandedCost);
    try {
      const row = await this.repository.createLandedCostBatch({ ...input, currency: financeCurrency(input.currency), actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.landed_cost_batch_created', targetType: 'finance.landed_cost_batch', targetId: row.id, metadata: { shipmentId: input.shipmentId } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async addLandedCostComponent(actor: FinanceActor, batchId: string, input: AddLandedCostComponentInput): Promise<any> {
    requirePermission(actor, FinanceCapability.LandedCost);
    try {
      const row = await this.repository.addLandedCostComponent(batchId, { ...input, amount: financeNonNegative(input.amount, 'amount'), currency: financeCurrency(input.currency), batchCurrencyAmount: financeNonNegative(input.batchCurrencyAmount, 'batchCurrencyAmount'), actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.landed_cost_component_added', targetType: 'finance.landed_cost_component', targetId: row.id, metadata: { batchId, category: input.category } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async allocateLandedCost(actor: FinanceActor, componentId: string, input: AllocateLandedCostInput): Promise<any> {
    requirePermission(actor, FinanceCapability.LandedCost);
    try {
      return await this.repository.allocateLandedCost(componentId, { ...input, allocatedAmount: financeNonNegative(input.allocatedAmount, 'allocatedAmount'), basisValue: input.basisValue === undefined ? null : financeNonNegative(input.basisValue, 'basisValue'), actorUserId: actor.userId });
    } catch (error) { this.rethrow(error); }
  }

  async distributeLandedCost(actor:FinanceActor,id:string,input:{category:string;amount:number;note?:string}):Promise<any>{
    requirePermission(actor,FinanceCapability.LandedCost);
    const categories=['FREIGHT','INSURANCE','DUTY','IMPORT_VAT','OPERATIONAL_FEE','OTHER','GOODS','ANTI_DUMPING','COUNTERVAILING'];
    if(!categories.includes(input?.category))throw new FinanceValidationError('Invalid landed cost category');
    const amount=Number(input?.amount);
    if(!Number.isFinite(amount)||amount<0||amount>1000000000||Math.abs(amount*100-Math.round(amount*100))>0.00001)throw new FinanceValidationError('Cost amount must be nonnegative with at most two decimals');
    try{return await this.repository.distributeLandedCost(id,{category:input.category,amountCents:Math.round(amount*100),...(input.note!==undefined?{note:input.note}:{}),actorUserId:actor.userId})}
    catch(error){this.rethrow(error)}
  }

  async finalizeLandedCostBatch(actor: FinanceActor, id: string): Promise<any> {
    requirePermission(actor, FinanceCapability.LandedCost);
    try {
      const row = await this.repository.finalizeLandedCostBatch(id, actor.userId);
      if (!row) throw new FinanceConflictError('Landed-cost batch is missing or already finalized');
      await this.audit.record({ actorUserId: actor.userId, action: 'finance.landed_cost_finalized', targetType: 'finance.landed_cost_batch', targetId: id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  private async transitionDocument(actor: FinanceActor, id: string, expectedVersion: number, status: 'VERIFIED' | 'DRAFT'): Promise<any> {
    financeVersion(expectedVersion);
    try {
      const row = await this.repository.transitionDocument(id, expectedVersion, status, actor.userId);
      if (!row) throw new FinanceConflictError('Finance document changed or transition is invalid');
      await this.audit.record({ actorUserId: actor.userId, action: `finance.document_${status.toLowerCase()}`, targetType: 'finance.document', targetId: id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  private rethrow(error: unknown): never {
    if (error instanceof FinanceValidationError || error instanceof FinanceNotFoundError || error instanceof FinanceConflictError) throw error;
    const message = error instanceof Error ? error.message : '';
    const code = postgresErrorCode(error);
    if (code === '23503') throw new FinanceNotFoundError('Referenced Finance/Partner/source entity was not found');
    if (code === '23505') throw new FinanceConflictError(/idempotency/i.test(message) ? 'Duplicate Payment idempotency key' : 'Finance record already exists');
    if (code === '23514') throw new FinanceValidationError(message);
    if (/not found|requires mapped|must match|cannot|immutable|transition|exceeds|already reversed|Reverse active|requires explicit FX|FX rate|must belong|fully allocated|completely allocated|source Partner|source currency/i.test(message)) throw new FinanceConflictError(message);
    throw error;
  }
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return localDate(value);
  const text = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
  if (iso) return iso;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return localDate(parsed);
  throw new FinanceValidationError('Invalid Finance due date');
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function requirePermission(actor: FinanceActor, permission: string): void {
  if (!actor.permissions.includes(permission)) throw new ForbiddenError('FINANCE_FORBIDDEN', `Missing permission: ${permission}`);
}
