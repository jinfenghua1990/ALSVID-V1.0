import type { QueryExecutor } from '@alsvid/database';
import type {
  AddLandedCostComponentInput,
  AllocateLandedCostInput,
  AllocatePaymentInput,
  CreateFinanceDocumentInput,
  CreateFxRateInput,
  CreateLandedCostBatchInput,
  CreateObligationInput,
  CreatePaymentInput,
  FinanceDocumentLineInput,
  FinanceSourceType,
} from '../core/model.js';

export interface FinanceActor {
  userId: string;
  permissions: string[];
}

export interface FinanceAuditPort {
  record(
    input: {
      actorUserId?: string | null;
      action: string;
      targetType: string;
      targetId?: string | null;
      metadata?: Record<string, unknown>;
    },
    executor?: QueryExecutor,
  ): Promise<void>;
}

export type NormalizedDocumentInput = Omit<CreateFinanceDocumentInput, 'currency' | 'sourceType' | 'sourceId'> & {
  currency: string;
  sourceType: FinanceSourceType;
  sourceId: string | null;
  actorUserId: string;
};

export type NormalizedLineInput = Omit<FinanceDocumentLineInput, 'quantity' | 'unit' | 'unitPrice' | 'netAmount' | 'taxAmount'> & {
  quantity: string;
  unit: string;
  unitPrice: string;
  netAmount: string;
  taxAmount: string;
};

export type NormalizedObligationInput = Omit<CreateObligationInput, 'currency' | 'amount' | 'sourceType' | 'sourceId'> & {
  currency: string;
  amount: string;
  sourceType: FinanceSourceType;
  sourceId: string | null;
  actorUserId: string;
  documentId?: string | null;
};

export type NormalizedPaymentInput = Omit<CreatePaymentInput, 'currency' | 'amount'> & {
  currency: string;
  amount: string;
  actorUserId: string;
};

export type NormalizedFxRateInput = Omit<CreateFxRateInput, 'baseCurrency' | 'quoteCurrency' | 'rate'> & {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  actorUserId: string;
};

export type NormalizedAllocationInput = Omit<AllocatePaymentInput, 'paymentAmount' | 'obligationAmount'> & {
  paymentAmount: string;
  obligationAmount: string;
  actorUserId: string;
};

export type NormalizedLandedCostBatchInput = Omit<CreateLandedCostBatchInput, 'currency'> & {
  currency: string;
  actorUserId: string;
};

export type NormalizedLandedCostComponentInput = Omit<AddLandedCostComponentInput, 'amount' | 'currency' | 'batchCurrencyAmount'> & {
  amount: string;
  currency: string;
  batchCurrencyAmount: string;
  actorUserId: string;
};

export type NormalizedLandedAllocationInput = Omit<AllocateLandedCostInput, 'allocatedAmount' | 'basisValue'> & {
  allocatedAmount: string;
  basisValue: string | null;
  actorUserId: string;
};

export interface FinanceRepository {
  summary(): Promise<any>;
  transaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T>;
  createDocument(input: NormalizedDocumentInput, executor: QueryExecutor): Promise<any>;
  addDocumentLine(documentId: string, lineNo: number, input: NormalizedLineInput, executor: QueryExecutor): Promise<void>;
  refreshDocumentTotals(documentId: string, executor: QueryExecutor): Promise<any>;
  transitionDocument(documentId: string, expectedVersion: number, status: 'VERIFIED' | 'DRAFT', actorUserId: string): Promise<any | null>;
  voidDocument(documentId: string, expectedVersion: number, reason: string, actorUserId: string): Promise<any | null>;
  lockDocument(documentId: string, executor: QueryExecutor): Promise<any | null>;
  postDocument(documentId: string, expectedVersion: number, actorUserId: string, executor: QueryExecutor): Promise<any | null>;
  createObligation(input: NormalizedObligationInput, executor?: QueryExecutor): Promise<any>;
  voidObligation(obligationId: string, reason: string, actorUserId: string): Promise<any>;
  createPayment(input: NormalizedPaymentInput): Promise<any>;
  reversePayment(paymentId: string, reason: string, actorUserId: string): Promise<any>;
  createFxRate(input: NormalizedFxRateInput): Promise<any>;
  allocatePayment(input: NormalizedAllocationInput): Promise<any>;
  reverseAllocation(allocationId: string, reason: string, actorUserId: string): Promise<any>;
  createLandedCostBatch(input: NormalizedLandedCostBatchInput): Promise<any>;
  addLandedCostComponent(batchId: string, input: NormalizedLandedCostComponentInput): Promise<any>;
  allocateLandedCost(componentId: string, input: NormalizedLandedAllocationInput): Promise<any>;
  finalizeLandedCostBatch(batchId: string, actorUserId: string): Promise<any | null>;
  distributeLandedCost(batchId:string,input:{category:string;amountCents:number;note?:string;actorUserId:string}):Promise<any>;
}
